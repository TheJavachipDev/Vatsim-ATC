import { describe, expect, it } from "vitest";
import {
  GRACE_MISSED_POLLS,
  SessionTracker,
  recoverStaleSessions,
  type ControllerObservation,
  type TrackedSession,
} from "./session-tracker.js";

function obs(
  cid: number,
  callsign: string,
  logonTime: Date | null = null,
  vatsimFacility?: number,
): ControllerObservation {
  return { cid, callsign, frequency: null, rating: null, logonTime, vatsimFacility };
}

const T0 = new Date("2026-07-09T12:00:00Z");
const minutesLater = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

describe("SessionTracker", () => {
  it("opens a session when a new controller appears", () => {
    const tracker = new SessionTracker();
    const logon = new Date("2026-07-09T11:30:00Z");
    const result = tracker.processPoll([obs(123, "EGKK_TWR", logon)], T0);

    expect(result.opened).toHaveLength(1);
    expect(result.updated).toHaveLength(0);
    expect(result.closed).toHaveLength(0);
    const session = result.opened[0]!.session;
    expect(session.stationPrefix).toBe("EGKK");
    expect(session.facilityType).toBe("TWR");
    expect(session.startedAt).toEqual(logon);
    expect(session.lastSeenAt).toEqual(T0);
    expect(tracker.openCount).toBe(1);
  });

  it("falls back to poll time when logon time is missing", () => {
    const tracker = new SessionTracker();
    const result = tracker.processPoll([obs(1, "EGKK_TWR", null)], T0);
    expect(result.opened[0]!.session.startedAt).toEqual(T0);
  });

  it("updates last_seen_at when a controller stays online", () => {
    const tracker = new SessionTracker();
    tracker.processPoll([obs(1, "EGKK_TWR")], T0);
    const t1 = minutesLater(T0, 1);
    const result = tracker.processPoll([obs(1, "EGKK_TWR")], t1);

    expect(result.opened).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]!.lastSeenAt).toEqual(t1);
  });

  it("does not close until the grace period of missed polls elapses", () => {
    const tracker = new SessionTracker();
    tracker.processPoll([obs(1, "EGKK_TWR")], T0);

    // Missed polls 1 and 2 keep the session open.
    expect(tracker.processPoll([], minutesLater(T0, 1)).closed).toHaveLength(0);
    expect(tracker.processPoll([], minutesLater(T0, 2)).closed).toHaveLength(0);
    expect(tracker.openCount).toBe(1);

    // The third consecutive miss closes it at last_seen_at (T0).
    const third = tracker.processPoll([], minutesLater(T0, 3));
    expect(GRACE_MISSED_POLLS).toBe(3);
    expect(third.closed).toHaveLength(1);
    expect(third.closed[0]!.endedAt).toEqual(T0);
    expect(tracker.openCount).toBe(0);
  });

  it("resets the miss counter when a controller reappears", () => {
    const tracker = new SessionTracker();
    tracker.processPoll([obs(1, "EGKK_TWR")], T0);
    tracker.processPoll([], minutesLater(T0, 1)); // miss 1
    tracker.processPoll([], minutesLater(T0, 2)); // miss 2
    tracker.processPoll([obs(1, "EGKK_TWR")], minutesLater(T0, 3)); // reappears

    // Two more misses should still not close (counter was reset).
    tracker.processPoll([], minutesLater(T0, 4));
    const result = tracker.processPoll([], minutesLater(T0, 5));
    expect(result.closed).toHaveLength(0);
    expect(tracker.openCount).toBe(1);
  });

  it("tracks distinct sessions per cid+callsign independently", () => {
    const tracker = new SessionTracker();
    const result = tracker.processPoll(
      [obs(1, "EGKK_TWR"), obs(2, "EGKK_GND"), obs(1, "EGKK_APP")],
      T0,
    );
    expect(result.opened).toHaveLength(3);
    expect(tracker.openCount).toBe(3);
  });

  it("hydrates existing open sessions without re-opening them", () => {
    const tracker = new SessionTracker();
    const existing: TrackedSession = {
      cid: 1,
      callsign: "EGKK_TWR",
      stationPrefix: "EGKK",
      infix: null,
      facilityType: "TWR",
      frequency: null,
      rating: null,
      startedAt: T0,
      lastSeenAt: T0,
    };
    tracker.hydrate([existing]);
    const result = tracker.processPoll([obs(1, "EGKK_TWR")], minutesLater(T0, 1));
    expect(result.opened).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
  });

  it("opens CTR and FSS positions with sector infixes", () => {
    const tracker = new SessionTracker();
    const result = tracker.processPoll(
      [
        obs(1, "LON_S_CTR"),
        obs(2, "LON_N_CTR"),
        obs(3, "RU-SC_FSS"),
        obs(4, "RST_SUP", null, 1),
      ],
      T0,
    );

    expect(result.opened).toHaveLength(4);
    expect(result.opened.map((o) => o.session.callsign).sort()).toEqual([
      "LON_N_CTR",
      "LON_S_CTR",
      "RST_SUP",
      "RU-SC_FSS",
    ]);
    expect(result.opened.find((o) => o.session.callsign === "LON_S_CTR")!.session.infix).toBe("S");
    expect(result.opened.find((o) => o.session.callsign === "RST_SUP")!.session.facilityType).toBe(
      "FSS",
    );
  });
});

describe("recoverStaleSessions", () => {
  const makeSession = (lastSeenAt: Date): TrackedSession => ({
    cid: 1,
    callsign: "EGKK_TWR",
    stationPrefix: "EGKK",
    infix: null,
    facilityType: "TWR",
    frequency: null,
    rating: null,
    startedAt: minutesLater(lastSeenAt, -30),
    lastSeenAt,
  });

  it("closes sessions older than the stale window", () => {
    const now = T0;
    const { stale, fresh } = recoverStaleSessions([makeSession(minutesLater(now, -10))], now);
    expect(stale).toHaveLength(1);
    expect(fresh).toHaveLength(0);
    expect(stale[0]!.endedAt).toEqual(minutesLater(now, -10));
  });

  it("keeps recent sessions as still-live", () => {
    const now = T0;
    const { stale, fresh } = recoverStaleSessions([makeSession(minutesLater(now, -2))], now);
    expect(stale).toHaveLength(0);
    expect(fresh).toHaveLength(1);
  });
});
