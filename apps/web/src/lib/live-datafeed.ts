import {
  VatsimDatafeedSchema,
  isObserverCallsign,
  parseCallsign,
  regionForPrefix,
  stationLookupPrefixes,
} from "@vatsim-atc/core";
import type { OpenSession } from "./queries";

const DATAFEED_URL = "https://data.vatsim.net/v3/vatsim-data.json";
const CACHE_MS = 30_000;

interface CacheEntry {
  fetchedAt: number;
  byPrefix: Map<string, OpenSession[]>;
  totalOnline: number;
  regionCounts: Map<string, number>;
}

let cache: CacheEntry | null = null;

function controllerToSession(controller: {
  cid: number;
  callsign: string;
  frequency: string | null;
  logon_time: string;
  facility: number;
}): OpenSession | null {
  const parsed = parseCallsign(controller.callsign, { vatsimFacility: controller.facility });
  const logon = new Date(controller.logon_time);
  return {
    cid: controller.cid,
    callsign: parsed.callsign,
    facilityType: parsed.facilityType,
    infix: parsed.infix,
    frequency: controller.frequency,
    startedAt: Number.isNaN(logon.getTime()) ? new Date() : logon,
  };
}

/** Load the VATSIM datafeed and index open controllers by station prefix. */
async function loadLiveIndex(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return cache;
  }

  const response = await fetch(DATAFEED_URL, {
    headers: { "User-Agent": "vatsim-atc.com web (live status)", Accept: "application/json" },
    // Avoid serving an old datafeed from Next.js's persistent server cache.
    // The module cache above controls the 30-second refresh interval.
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`VATSIM datafeed returned ${response.status}`);
  }

  const parsed = VatsimDatafeedSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("VATSIM datafeed validation failed");
  }

  const byPrefix = new Map<string, OpenSession[]>();
  const regionCounts = new Map<string, number>();
  let totalOnline = 0;

  for (const controller of parsed.data.controllers) {
    if (controller.facility === 0) continue;
    if (isObserverCallsign(controller.callsign)) continue;

    const session = controllerToSession({
      cid: controller.cid,
      callsign: controller.callsign,
      frequency: controller.frequency ?? null,
      logon_time: controller.logon_time,
      facility: controller.facility,
    });
    if (!session) continue;

    const prefix = parseCallsign(controller.callsign, { vatsimFacility: controller.facility })
      .stationPrefix;
    const list = byPrefix.get(prefix) ?? [];
    list.push(session);
    byPrefix.set(prefix, list);
    totalOnline += 1;

    // Region counts use the same prefix heuristic as the home page strip.
    const region = regionForPrefix(prefix);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }

  cache = { fetchedAt: now, byPrefix, totalOnline, regionCounts };
  return cache;
}

/** Live controllers for a station, straight from the VATSIM datafeed. */
export async function fetchLiveSessions(stationPrefix: string): Promise<OpenSession[]> {
  const index = await loadLiveIndex();
  const prefixes = stationLookupPrefixes(stationPrefix);
  const byKey = new Map<string, OpenSession>();

  for (const prefix of prefixes) {
    for (const session of index.byPrefix.get(prefix) ?? []) {
      // Deduplicate when the same controller is findable under both KJAX and JAX.
      const key = `${session.cid}:${session.callsign}`;
      if (!byKey.has(key)) byKey.set(key, session);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.facilityType.localeCompare(b.facilityType) ||
    a.callsign.localeCompare(b.callsign),
  );
}

export async function fetchLiveTotalOnline(): Promise<number> {
  const index = await loadLiveIndex();
  return index.totalOnline;
}

export async function fetchLiveRegionSummary(): Promise<{ region: string; online: number }[]> {
  const index = await loadLiveIndex();
  return [...index.regionCounts.entries()]
    .map(([region, online]) => ({ region, online }))
    .sort((a, b) => b.online - a.online);
}

/** Bust the in-memory cache (e.g. after a manual refresh). */
export function clearLiveCache(): void {
  cache = null;
}
