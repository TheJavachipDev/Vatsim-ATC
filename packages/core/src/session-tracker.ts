import { parseCallsign } from "./callsign.js";
import type { FacilityType } from "./types.js";

/** Number of consecutive missed polls before an open session is closed. */
export const GRACE_MISSED_POLLS = 3;
/** Sessions not seen within this window on startup are closed during recovery. */
export const STALE_RECOVERY_MS = 5 * 60 * 1000;

export interface ControllerObservation {
  cid: number;
  callsign: string;
  frequency: string | null;
  rating: number | null;
  /** Logon time from the feed; falls back to poll time when missing/invalid. */
  logonTime: Date | null;
  /** VATSIM datafeed facility id — used when the callsign suffix is non-standard. */
  vatsimFacility?: number;
}

export interface TrackedSession {
  cid: number;
  callsign: string;
  stationPrefix: string;
  infix: string | null;
  facilityType: FacilityType;
  frequency: string | null;
  rating: number | null;
  startedAt: Date;
  lastSeenAt: Date;
}

export interface OpenedAction {
  session: TrackedSession;
}

export interface UpdatedAction {
  cid: number;
  callsign: string;
  lastSeenAt: Date;
}

export interface ClosedAction {
  cid: number;
  callsign: string;
  endedAt: Date;
}

export interface PollResult {
  opened: OpenedAction[];
  updated: UpdatedAction[];
  closed: ClosedAction[];
}

function sessionKey(cid: number, callsign: string): string {
  return `${cid}:${callsign}`;
}

interface InternalSession extends TrackedSession {
  missedPolls: number;
}

/**
 * Diffs consecutive datafeed polls into session lifecycle actions. Pure and
 * in-memory: the caller (collector) persists the emitted actions and rebuilds
 * the tracker's state on startup via {@link SessionTracker.hydrate}.
 */
export class SessionTracker {
  private readonly open = new Map<string, InternalSession>();

  /** Seed the tracker with sessions already open in the database. */
  hydrate(sessions: TrackedSession[]): void {
    for (const session of sessions) {
      this.open.set(sessionKey(session.cid, session.callsign), {
        ...session,
        missedPolls: 0,
      });
    }
  }

  /** Currently open sessions (for diagnostics/tests). */
  get openCount(): number {
    return this.open.size;
  }

  processPoll(observations: ControllerObservation[], now: Date): PollResult {
    const opened: OpenedAction[] = [];
    const updated: UpdatedAction[] = [];
    const closed: ClosedAction[] = [];
    const seen = new Set<string>();

    for (const obs of observations) {
      const key = sessionKey(obs.cid, obs.callsign);
      seen.add(key);
      const existing = this.open.get(key);

      if (existing) {
        existing.lastSeenAt = now;
        existing.missedPolls = 0;
        updated.push({ cid: obs.cid, callsign: obs.callsign, lastSeenAt: now });
        continue;
      }

      const parsed = parseCallsign(obs.callsign, { vatsimFacility: obs.vatsimFacility });
      const startedAt =
        obs.logonTime && !Number.isNaN(obs.logonTime.getTime()) ? obs.logonTime : now;
      const session: TrackedSession = {
        cid: obs.cid,
        callsign: parsed.callsign,
        stationPrefix: parsed.stationPrefix,
        infix: parsed.infix,
        facilityType: parsed.facilityType,
        frequency: obs.frequency,
        rating: obs.rating,
        startedAt,
        lastSeenAt: now,
      };
      this.open.set(key, { ...session, missedPolls: 0 });
      opened.push({ session });
    }

    for (const [key, session] of this.open) {
      if (seen.has(key)) continue;
      session.missedPolls += 1;
      if (session.missedPolls >= GRACE_MISSED_POLLS) {
        closed.push({
          cid: session.cid,
          callsign: session.callsign,
          endedAt: session.lastSeenAt,
        });
        this.open.delete(key);
      }
    }

    return { opened, updated, closed };
  }
}

export interface RecoveryPartition {
  /** Stale sessions to close at their last_seen_at. */
  stale: ClosedAction[];
  /** Fresh sessions to hydrate back into a tracker. */
  fresh: TrackedSession[];
}

/**
 * On startup, split still-open DB sessions into those that went stale while the
 * collector was down (close them) and those recent enough to still be live.
 */
export function recoverStaleSessions(
  openSessions: TrackedSession[],
  now: Date,
  staleMs: number = STALE_RECOVERY_MS,
): RecoveryPartition {
  const stale: ClosedAction[] = [];
  const fresh: TrackedSession[] = [];
  for (const session of openSessions) {
    if (now.getTime() - session.lastSeenAt.getTime() > staleMs) {
      stale.push({
        cid: session.cid,
        callsign: session.callsign,
        endedAt: session.lastSeenAt,
      });
    } else {
      fresh.push(session);
    }
  }
  return { stale, fresh };
}
