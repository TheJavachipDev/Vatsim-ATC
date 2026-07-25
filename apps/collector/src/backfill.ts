import {
  computeOldestStart,
  createDb,
  dbSchema,
  emptyPageCounters,
  estimateEtaSeconds,
  generateSeedSessions,
  hasDedupeConflict,
  isNewestFirst,
  isPageBeyondHorizon,
  mergeOldestStart,
  nextBackoffMs,
  parseCallsign,
  parseHistoryItem,
  shouldSkipRecentSession,
  stepDownPageSize,
  VatsimHistoryItemSchema,
  VatsimHistoryResponseSchema,
  type BackfillPageCounters,
  type BackfillProgress,
  type ParsedHistoryItem,
} from "@vatsim-atc/core";
import { config } from "./config.js";
import { logger } from "./logger.js";
import {
  clearBackfillState,
  countBackfillSessions,
  countBackfillSessionsByFacility,
  findDedupeCandidates,
  loadBackfillState,
  saveBackfillState,
  upsertBackfillSessions,
  upsertStations,
  type BackfillSessionRow,
} from "./repository.js";
import { refreshHourlyStats } from "./stats-cron.js";

const HISTORY_URL = "https://api.vatsim.net/v2/atc/history";
const FETCH_TIMEOUT_MS = 60_000;
const backfillUserAgent = `vatsim-atc.com backfill (contact: ${config.contactEmail})`;

interface HistoryPage {
  items: unknown[];
  count: number;
}

interface FetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBackfillConfig(): {
  weeks: number;
  pageSize: number;
  delayMs: number;
  fresh: boolean;
  seed: boolean;
} {
  const seed = process.argv.includes("--seed");
  return {
    weeks: seed
      ? Number(process.env.BACKFILL_SEED_WEEKS ?? 8)
      : Number(process.env.BACKFILL_WEEKS ?? 30),
    pageSize: Number(process.env.BACKFILL_PAGE_SIZE ?? 250),
    delayMs: Number(process.env.BACKFILL_DELAY_MS ?? 1000),
    fresh: process.argv.includes("--fresh"),
    seed,
  };
}

async function fetchHistoryPage(offset: number, limit: number): Promise<FetchResult> {
  const url = new URL(HISTORY_URL);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": backfillUserAgent, Accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHistoryPageWithRetry(
  offset: number,
  limit: number,
  onStepDown: () => void,
): Promise<HistoryPage> {
  let attempt = 0;
  let currentLimit = limit;

  while (true) {
    let result: FetchResult;
    try {
      result = await fetchHistoryPage(offset, currentLimit);
    } catch (err) {
      // Timeouts / network errors: back off and retry the same offset, same as 5xx.
      const waitMs = nextBackoffMs(attempt);
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), attempt, waitMs, offset },
        "history API unreachable; backing off",
      );
      await sleep(waitMs);
      attempt += 1;
      continue;
    }

    if (result.status === 400 && currentLimit > 100) {
      const stepped = stepDownPageSize(currentLimit);
      if (stepped) {
        logger.warn({ from: currentLimit, to: stepped }, "history API rejected page size; stepping down");
        currentLimit = stepped;
        onStepDown();
        continue;
      }
    }

    if (result.status === 429 || result.status >= 500) {
      const waitMs = nextBackoffMs(attempt);
      logger.warn({ status: result.status, attempt, waitMs, offset }, "history API error; backing off");
      await sleep(waitMs);
      attempt += 1;
      continue;
    }

    if (!result.ok) {
      throw new Error(`History API request failed with status ${result.status}`);
    }

    const parsed = VatsimHistoryResponseSchema.safeParse(result.body);
    if (!parsed.success) {
      throw new Error("History API returned an unexpected payload shape");
    }

    return parsed.data;
  }
}

async function verifyNewestFirst(limit: number, onStepDown: () => void): Promise<void> {
  const page = await fetchHistoryPageWithRetry(0, limit, onStepDown);
  const starts: { startedAt: Date }[] = [];
  for (const raw of page.items) {
    const parsed = parseHistoryItem(raw);
    if (parsed) starts.push({ startedAt: parsed.startedAt });
  }
  if (!isNewestFirst(starts)) {
    throw new Error("History API items are not newest-first; aborting backfill");
  }
}

function classifyRawItem(
  raw: unknown,
  now: Date,
): { kind: "parsed"; item: ParsedHistoryItem } | { kind: "skip"; reason: keyof BackfillPageCounters } {
  const zod = VatsimHistoryItemSchema.safeParse(raw);
  if (!zod.success) {
    return { kind: "skip", reason: "skippedMalformed" };
  }
  if (!zod.data.end) {
    return { kind: "skip", reason: "skippedOpen" };
  }
  const parsed = parseHistoryItem(raw);
  if (!parsed) {
    return { kind: "skip", reason: "skippedMalformed" };
  }
  if (shouldSkipRecentSession(parsed.startedAt, now)) {
    return { kind: "skip", reason: "skippedRecent" };
  }
  return { kind: "parsed", item: parsed };
}

async function processPage(
  db: ReturnType<typeof createDb>["db"],
  rawItems: unknown[],
  now: Date,
): Promise<{ counters: BackfillPageCounters; parsedItems: ParsedHistoryItem[]; rows: BackfillSessionRow[] }> {
  const counters = emptyPageCounters();
  const parsedItems: ParsedHistoryItem[] = [];
  const rows: BackfillSessionRow[] = [];
  const stationPrefixes = new Set<string>();

  for (const raw of rawItems) {
    const classified = classifyRawItem(raw, now);
    if (classified.kind === "skip") {
      counters[classified.reason] += 1;
      continue;
    }

    const item = classified.item;
    parsedItems.push(item);

    const parsedCallsign = parseCallsign(item.callsign);
    const dedupeCandidates = await findDedupeCandidates(db, item.cid, item.callsign, item.startedAt);
    if (hasDedupeConflict(dedupeCandidates, item.cid, item.callsign, item.startedAt)) {
      counters.skippedDedupe += 1;
      continue;
    }

    stationPrefixes.add(parsedCallsign.stationPrefix);
    rows.push({
      externalId: item.externalId,
      cid: item.cid,
      callsign: parsedCallsign.callsign,
      stationPrefix: parsedCallsign.stationPrefix,
      infix: parsedCallsign.infix,
      facilityType: parsedCallsign.facilityType,
      rating: item.rating,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
    });
  }

  if (rows.length > 0) {
    await upsertBackfillSessions(db, rows);
    await upsertStations(db, stationPrefixes, now);
    counters.inserted = rows.length;
  }

  return { counters, parsedItems, rows };
}

async function runSeedBackfill(
  db: ReturnType<typeof createDb>["db"],
  weeks: number,
  fresh: boolean,
): Promise<void> {
  if (fresh) {
    await clearBackfillState(db);
    await db.delete(dbSchema.stationHourlyStats);
    await db.delete(dbSchema.sessions);
    await db.delete(dbSchema.stations);
    logger.info("--fresh passed; cleared sessions, stations, and stats for seed backfill");
  }

  const now = new Date();
  const { sessions, stations } = generateSeedSessions({ weeks, now });
  const rows: BackfillSessionRow[] = sessions.map((session) => ({
    externalId: session.externalId,
    cid: session.cid,
    callsign: session.callsign,
    stationPrefix: session.stationPrefix,
    infix: session.infix,
    facilityType: session.facilityType,
    rating: session.rating,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  }));

  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await upsertBackfillSessions(db, rows.slice(i, i + chunkSize));
  }

  await upsertStations(
    db,
    stations.map((station) => station.prefix),
    now,
  );

  const facilityCounts = await countBackfillSessionsByFacility(db);
  const totalBackfill = await countBackfillSessions(db);
  const oldestStartSeen = sessions.reduce(
    (min, session) => (session.startedAt.getTime() < min.getTime() ? session.startedAt : min),
    sessions[0]?.startedAt ?? now,
  );

  logger.info(
    {
      mode: "seed",
      weeks,
      generated: sessions.length,
      inserted: rows.length,
      totalBackfillSessions: totalBackfill,
      facilityCounts: Object.fromEntries(facilityCounts),
      oldestStartSeen: oldestStartSeen.toISOString(),
    },
    "seed backfill complete; refreshing hourly stats",
  );

  await refreshHourlyStats(db);
}

async function main(): Promise<void> {
  const { weeks, pageSize: initialPageSize, delayMs, fresh, seed } = readBackfillConfig();
  const { db, pool } = createDb(config.databaseUrl);

  if (seed) {
    logger.info({ weeks }, "running deterministic seed backfill (history API skipped)");
    await runSeedBackfill(db, weeks, fresh);
    await pool.end();
    return;
  }

  let pageSize = initialPageSize;
  const horizonCutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  const onStepDown = (): void => {
    pageSize = 100;
  };

  if (fresh) {
    await clearBackfillState(db);
    logger.info("--fresh passed; backfill state cleared");
  }

  let state: BackfillProgress = (await loadBackfillState(db)) ?? {
    offset: 0,
    oldestStartSeen: null,
  };

  if (state.offset === 0) {
    await verifyNewestFirst(Math.min(pageSize, 10), onStepDown);
    logger.info("verified history API is newest-first");
  }

  const runStartedAt = Date.now();
  let totalInserted = 0;
  let pages = 0;

  logger.info({ weeks, pageSize, delayMs, offset: state.offset }, "backfill starting");

  while (true) {
    const page = await fetchHistoryPageWithRetry(state.offset, pageSize, onStepDown);
    if (page.items.length === 0) {
      logger.info({ offset: state.offset }, "empty page; backfill complete");
      break;
    }

    const now = new Date();
    const { counters, parsedItems } = await processPage(db, page.items, now);
    totalInserted += counters.inserted;
    pages += 1;

    const pageOldest = computeOldestStart(parsedItems);
    state = {
      offset: state.offset + page.items.length,
      oldestStartSeen: mergeOldestStart(state.oldestStartSeen, pageOldest),
    };
    await saveBackfillState(db, state);

    const elapsedMs = Date.now() - runStartedAt;
    const remaining = Math.max(page.count - state.offset, 0);
    const etaSeconds = estimateEtaSeconds(totalInserted, elapsedMs, remaining);

    logger.info(
      {
        offset: state.offset,
        pageSize,
        totalCount: page.count,
        inserted: counters.inserted,
        skippedDedupe: counters.skippedDedupe,
        skippedOpen: counters.skippedOpen,
        skippedRecent: counters.skippedRecent,
        skippedMalformed: counters.skippedMalformed,
        skippedUnparseableCallsign: counters.skippedUnparseableCallsign,
        oldestStartSeen: state.oldestStartSeen?.toISOString() ?? null,
        etaSeconds,
      },
      "backfill page processed",
    );

    if (isPageBeyondHorizon(parsedItems, horizonCutoff)) {
      logger.info({ horizonCutoff: horizonCutoff.toISOString() }, "reached backfill horizon");
      break;
    }

    await sleep(delayMs);
  }

  const facilityCounts = await countBackfillSessionsByFacility(db);
  const totalBackfill = await countBackfillSessions(db);
  const weeksCovered = state.oldestStartSeen
    ? Math.max(0, (Date.now() - state.oldestStartSeen.getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0;

  logger.info(
    {
      pages,
      totalInsertedThisRun: totalInserted,
      totalBackfillSessions: totalBackfill,
      weeksCovered: Math.round(weeksCovered * 10) / 10,
      facilityCounts: Object.fromEntries(facilityCounts),
      oldestStartSeen: state.oldestStartSeen?.toISOString() ?? null,
    },
    "backfill complete; refreshing hourly stats",
  );

  await refreshHourlyStats(db);
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "backfill failed");
  process.exit(1);
});
