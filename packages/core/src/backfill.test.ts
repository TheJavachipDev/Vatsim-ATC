import { describe, expect, it } from "vitest";
import {
  computeOldestStart,
  DEDUPE_WINDOW_MS,
  emptyPageCounters,
  estimateEtaSeconds,
  hasDedupeConflict,
  isDedupeMatch,
  isNewestFirst,
  isPageBeyondHorizon,
  mergeOldestStart,
  nextBackoffMs,
  shouldSkipRecentSession,
  stepDownPageSize,
} from "./backfill.js";
import {
  parseHistoryItem,
  VatsimHistoryItemSchema,
  VatsimHistoryResponseSchema,
} from "./schemas/vatsim-history.js";

const NOW = new Date("2026-07-09T12:00:00Z");
const HORIZON = new Date("2026-06-01T12:00:00Z");

describe("isDedupeMatch", () => {
  it("matches within ±2 minutes", () => {
    const base = new Date("2026-07-09T12:00:00Z");
    expect(isDedupeMatch(base, new Date("2026-07-09T12:01:30Z"))).toBe(true);
    expect(isDedupeMatch(base, new Date("2026-07-09T11:58:00Z"))).toBe(true);
    expect(isDedupeMatch(base, new Date("2026-07-09T11:57:00Z"))).toBe(false);
  });
});

describe("hasDedupeConflict", () => {
  it("detects same cid/callsign within the dedupe window", () => {
    const existing = [
      {
        cid: 123,
        callsign: "EGKK_TWR",
        startedAt: new Date("2026-07-09T12:00:00Z"),
      },
    ];
    expect(
      hasDedupeConflict(
        existing,
        123,
        "egkk_twr",
        new Date("2026-07-09T12:01:00Z"),
        DEDUPE_WINDOW_MS,
      ),
    ).toBe(true);
    expect(
      hasDedupeConflict(
        existing,
        123,
        "EGKK_TWR",
        new Date("2026-07-09T12:05:00Z"),
        DEDUPE_WINDOW_MS,
      ),
    ).toBe(false);
    expect(
      hasDedupeConflict(
        existing,
        456,
        "EGKK_TWR",
        new Date("2026-07-09T12:00:30Z"),
        DEDUPE_WINDOW_MS,
      ),
    ).toBe(false);
  });
});

describe("shouldSkipRecentSession", () => {
  it("skips sessions newer than now minus 10 minutes", () => {
    expect(shouldSkipRecentSession(new Date("2026-07-09T11:55:00Z"), NOW)).toBe(true);
    expect(shouldSkipRecentSession(new Date("2026-07-09T11:49:00Z"), NOW)).toBe(false);
  });
});

describe("isPageBeyondHorizon", () => {
  it("returns false when any record is within the horizon", () => {
    const items = [
      { startedAt: new Date("2026-05-01T00:00:00Z") },
      { startedAt: new Date("2026-06-15T00:00:00Z") },
    ];
    expect(isPageBeyondHorizon(items, HORIZON)).toBe(false);
  });

  it("returns true when all records are older than the horizon", () => {
    const items = [
      { startedAt: new Date("2026-05-01T00:00:00Z") },
      { startedAt: new Date("2026-05-15T00:00:00Z") },
    ];
    expect(isPageBeyondHorizon(items, HORIZON)).toBe(true);
  });

  it("returns false for an empty page", () => {
    expect(isPageBeyondHorizon([], HORIZON)).toBe(false);
  });
});

describe("isNewestFirst", () => {
  it("accepts descending start times", () => {
    expect(
      isNewestFirst([
        { startedAt: new Date("2026-07-09T12:00:00Z") },
        { startedAt: new Date("2026-07-09T11:00:00Z") },
      ]),
    ).toBe(true);
  });

  it("rejects ascending start times", () => {
    expect(
      isNewestFirst([
        { startedAt: new Date("2026-07-09T11:00:00Z") },
        { startedAt: new Date("2026-07-09T12:00:00Z") },
      ]),
    ).toBe(false);
  });
});

describe("resumability helpers", () => {
  it("merges oldest start across pages", () => {
    const first = new Date("2026-06-01T00:00:00Z");
    const second = new Date("2026-05-01T00:00:00Z");
    expect(mergeOldestStart(first, second)).toEqual(second);
    expect(mergeOldestStart(null, first)).toEqual(first);
  });

  it("tracks oldest start on a page", () => {
    const items = [
      { startedAt: new Date("2026-06-01T00:00:00Z") },
      { startedAt: new Date("2026-05-01T00:00:00Z") },
    ];
    expect(computeOldestStart(items)).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("starts counters at zero", () => {
    expect(emptyPageCounters()).toEqual({
      inserted: 0,
      skippedDedupe: 0,
      skippedOpen: 0,
      skippedRecent: 0,
      skippedMalformed: 0,
      skippedUnparseableCallsign: 0,
    });
  });
});

describe("backoff and page size", () => {
  it("doubles backoff up to the cap", () => {
    expect(nextBackoffMs(0)).toBe(30_000);
    expect(nextBackoffMs(1)).toBe(60_000);
    expect(nextBackoffMs(10)).toBe(600_000);
  });

  it("steps down from 250 to 100", () => {
    expect(stepDownPageSize(250)).toBe(100);
    expect(stepDownPageSize(100)).toBeNull();
  });

  it("estimates ETA from insert rate", () => {
    expect(estimateEtaSeconds(100, 10_000, 900)).toBe(90);
    expect(estimateEtaSeconds(0, 10_000, 900)).toBeNull();
  });
});

describe("Vatsim history Zod schemas", () => {
  const validItem = {
    connection_id: { id: "conn-1" },
    vatsim_id: 123456,
    rating: 3,
    callsign: "EGKK_TWR",
    start: "2026-07-01T10:00:00Z",
    end: "2026-07-01T12:00:00Z",
    server: "UK",
    aircrafttracked: 42,
  };

  it("parses a valid history response page", () => {
    const page = VatsimHistoryResponseSchema.parse({
      items: [validItem],
      count: 1,
    });
    expect(page.count).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it("parses connection_id as a bare number", () => {
    const parsed = parseHistoryItem({
      ...validItem,
      connection_id: 99,
    });
    expect(parsed?.externalId).toBe("99");
  });

  it("rejects malformed items at the item schema boundary", () => {
    expect(VatsimHistoryItemSchema.safeParse({ callsign: "EGKK_TWR" }).success).toBe(false);
    expect(parseHistoryItem({ callsign: "EGKK_TWR" })).toBeNull();
  });

  it("returns null for open sessions (null end)", () => {
    expect(parseHistoryItem({ ...validItem, end: null })).toBeNull();
  });

  it("returns null for invalid timestamps", () => {
    expect(parseHistoryItem({ ...validItem, start: "not-a-date" })).toBeNull();
  });
});
