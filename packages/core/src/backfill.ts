/** ±2 minutes — live collector and API timestamps may differ slightly. */
export const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

/** Live collector owns sessions newer than this cutoff. */
export const RECENT_CUTOFF_MS = 10 * 60 * 1000;

export const BACKFILL_INITIAL_BACKOFF_MS = 30_000;
export const BACKFILL_MAX_BACKOFF_MS = 10 * 60 * 1000;

export interface BackfillProgress {
  offset: number;
  oldestStartSeen: Date | null;
}

export interface BackfillPageCounters {
  inserted: number;
  skippedDedupe: number;
  skippedOpen: number;
  skippedRecent: number;
  skippedMalformed: number;
  skippedUnparseableCallsign: number;
}

export function emptyPageCounters(): BackfillPageCounters {
  return {
    inserted: 0,
    skippedDedupe: 0,
    skippedOpen: 0,
    skippedRecent: 0,
    skippedMalformed: 0,
    skippedUnparseableCallsign: 0,
  };
}

/** History API is assumed newest-first; verify on the first page. */
export function isNewestFirst(items: { startedAt: Date }[]): boolean {
  if (items.length < 2) return true;
  for (let i = 1; i < items.length; i += 1) {
    if (items[i - 1]!.startedAt.getTime() < items[i]!.startedAt.getTime()) {
      return false;
    }
  }
  return true;
}

/** Stop when every record on the page is older than the target horizon. */
export function isPageBeyondHorizon(
  items: { startedAt: Date }[],
  horizonCutoff: Date,
): boolean {
  if (items.length === 0) return false;
  return items.every((item) => item.startedAt.getTime() < horizonCutoff.getTime());
}

export function shouldSkipRecentSession(
  start: Date,
  now: Date,
  cutoffMs = RECENT_CUTOFF_MS,
): boolean {
  return start.getTime() > now.getTime() - cutoffMs;
}

export function isDedupeMatch(
  existingStart: Date,
  candidateStart: Date,
  windowMs = DEDUPE_WINDOW_MS,
): boolean {
  return Math.abs(existingStart.getTime() - candidateStart.getTime()) <= windowMs;
}

export function hasDedupeConflict(
  existing: { cid: number; callsign: string; startedAt: Date }[],
  cid: number,
  callsign: string,
  startedAt: Date,
  windowMs = DEDUPE_WINDOW_MS,
): boolean {
  const normalized = callsign.trim().toUpperCase();
  return existing.some(
    (row) =>
      row.cid === cid &&
      row.callsign.trim().toUpperCase() === normalized &&
      isDedupeMatch(row.startedAt, startedAt, windowMs),
  );
}

export function computeOldestStart(items: { startedAt: Date }[]): Date | null {
  if (items.length === 0) return null;
  return items.reduce(
    (min, item) => (item.startedAt.getTime() < min.getTime() ? item.startedAt : min),
    items[0]!.startedAt,
  );
}

export function mergeOldestStart(current: Date | null, pageOldest: Date | null): Date | null {
  if (!pageOldest) return current;
  if (!current) return pageOldest;
  return pageOldest.getTime() < current.getTime() ? pageOldest : current;
}

export function nextBackoffMs(
  attempt: number,
  initialMs = BACKFILL_INITIAL_BACKOFF_MS,
  maxMs = BACKFILL_MAX_BACKOFF_MS,
): number {
  return Math.min(initialMs * 2 ** attempt, maxMs);
}

/** Step down page size when the API rejects large limits. */
export function stepDownPageSize(current: number): number | null {
  if (current > 100) return 100;
  return null;
}

export function estimateEtaSeconds(
  insertedSinceStart: number,
  elapsedMs: number,
  remainingEstimate: number,
): number | null {
  if (insertedSinceStart === 0 || elapsedMs <= 0) return null;
  const rate = insertedSinceStart / elapsedMs;
  if (rate <= 0) return null;
  return Math.round(remainingEstimate / rate / 1000);
}
