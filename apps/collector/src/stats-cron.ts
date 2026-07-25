import { WINDOW_WEEKS, computeHourlyStats, type Database } from "@vatsim-atc/core";
import { logger } from "./logger.js";
import { loadRecentSessions, replaceHourlyStats } from "./repository.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Recompute and materialize per-station hour-of-week probabilities. */
export async function refreshHourlyStats(db: Database): Promise<void> {
  const startedAt = Date.now();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_WEEKS * WEEK_MS);

  const sessions = await loadRecentSessions(db, since);
  const computed = computeHourlyStats(sessions, now);
  const rows = await replaceHourlyStats(db, computed, now);

  logger.info(
    {
      sessions: sessions.length,
      stationFacilities: computed.length,
      rows,
      durationMs: Date.now() - startedAt,
    },
    "hourly stats refreshed",
  );
}
