import {
  SessionTracker,
  VatsimDatafeedSchema,
  isObserverCallsign,
  parseCallsign,
  recoverStaleSessions,
  type ControllerObservation,
  type Database,
} from "@vatsim-atc/core";
import { config } from "./config.js";
import { fetchJson } from "./fetch-json.js";
import { logger } from "./logger.js";
import {
  closeSessions,
  insertOpenedSessions,
  loadOpenSessions,
  touchSessions,
  upsertStations,
} from "./repository.js";
import { withRetry } from "./retry.js";

export class Poller {
  private readonly tracker = new SessionTracker();

  constructor(private readonly db: Database) {}

  /** Close sessions that went stale while down, then hydrate the live ones. */
  async recover(now: Date = new Date()): Promise<void> {
    const open = await loadOpenSessions(this.db);
    const { stale, fresh } = recoverStaleSessions(open, now);
    if (stale.length > 0) {
      await closeSessions(this.db, stale);
    }
    this.tracker.hydrate(fresh);
    logger.info(
      { recovered: fresh.length, closedStale: stale.length },
      "collector recovered open sessions",
    );
  }

  async runCycle(): Promise<void> {
    const startedAt = Date.now();
    let payload: unknown;
    try {
      payload = await withRetry(() => fetchJson(config.datafeedUrl, config.fetchTimeoutMs), {
        retries: 2,
        baseDelayMs: 1000,
      });
    } catch (err) {
      logger.error({ err }, "datafeed fetch failed; skipping cycle");
      return;
    }

    const parsed = VatsimDatafeedSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues.slice(0, 5) }, "datafeed validation failed");
      return;
    }

    const now = new Date();
    const observations: ControllerObservation[] = [];
    for (const controller of parsed.data.controllers) {
      if (controller.facility === 0) continue;
      if (isObserverCallsign(controller.callsign)) continue;
      const logon = new Date(controller.logon_time);
      observations.push({
        cid: controller.cid,
        callsign: controller.callsign,
        frequency: controller.frequency ?? null,
        rating: controller.rating ?? null,
        logonTime: Number.isNaN(logon.getTime()) ? null : logon,
        vatsimFacility: controller.facility,
      });
    }

    const { opened, updated, closed } = this.tracker.processPoll(observations, now);

    await insertOpenedSessions(this.db, opened);
    await touchSessions(this.db, updated, now);
    await closeSessions(this.db, closed);

    const prefixes = new Set<string>();
    for (const action of opened) prefixes.add(action.session.stationPrefix);
    for (const action of closed) {
      prefixes.add(parseCallsign(action.callsign).stationPrefix);
    }
    await upsertStations(this.db, [...prefixes], now);

    logger.info(
      {
        controllers: observations.length,
        opened: opened.length,
        closed: closed.length,
        openSessions: this.tracker.openCount,
        durationMs: Date.now() - startedAt,
      },
      "poll cycle complete",
    );
  }
}
