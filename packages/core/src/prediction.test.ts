import { describe, expect, it } from "vitest";
import {
  BOOKING_PROBABILITY,
  averageProbabilityOverWindow,
  clearDataCoverageWeeksCache,
  computeHourlyStats,
  getDataCoverageWeeks,
  hourOfWeek,
  predictAt,
  weekWeight,
} from "./prediction.js";
import type { BookingInterval, HourlyStat, SessionInterval } from "./types.js";

const NOW = new Date("2026-07-09T12:00:00Z"); // Thursday, hour-aligned
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Thursday (UTC day 4) at 11:00 -> bucket 4*24 + 11 = 107.
const BUCKET_THU_11 = 107;

function session(startIso: string, endIso: string): SessionInterval {
  return {
    stationPrefix: "EGKK",
    facilityType: "TWR",
    startedAt: new Date(startIso),
    endedAt: new Date(endIso),
  };
}

describe("hourOfWeek", () => {
  it("maps Sunday 00:00 to 0 and Saturday 23:00 to 167", () => {
    expect(hourOfWeek(new Date("2026-07-05T00:00:00Z"))).toBe(0); // Sunday
    expect(hourOfWeek(new Date("2026-07-11T23:00:00Z"))).toBe(167); // Saturday
  });

  it("maps Thursday 11:00 to 107", () => {
    expect(hourOfWeek(new Date("2026-07-09T11:00:00Z"))).toBe(BUCKET_THU_11);
  });
});

describe("weekWeight", () => {
  it("applies recency weighting bands", () => {
    expect(weekWeight(1)).toBe(1.5);
    expect(weekWeight(8)).toBe(1.5);
    expect(weekWeight(9)).toBe(1.0);
    expect(weekWeight(17)).toBe(1.0);
    expect(weekWeight(18)).toBe(0.6);
    expect(weekWeight(26)).toBe(0.6);
  });
});

describe("computeHourlyStats", () => {
  it("marks a fully covered bucket with a single observed week", () => {
    const stats = computeHourlyStats(
      [session("2026-07-09T11:00:00Z", "2026-07-09T12:00:00Z")],
      NOW,
    );
    expect(stats).toHaveLength(1);
    const buckets = stats[0]!.buckets;
    expect(buckets).toHaveLength(168);

    const covered = buckets[BUCKET_THU_11]!;
    expect(covered.probability).toBe(1);
    expect(covered.sampleWeeks).toBe(1);
    expect(covered.lowConfidence).toBe(true);

    // A bucket with no data stays empty.
    expect(buckets[50]!.sampleWeeks).toBe(0);
    expect(buckets[50]!.probability).toBe(0);
  });

  it("ignores coverage below the 15-minute threshold", () => {
    const stats = computeHourlyStats(
      [session("2026-07-09T11:00:00Z", "2026-07-09T11:10:00Z")], // 10 min
      NOW,
    );
    expect(stats[0]!.buckets[BUCKET_THU_11]!.probability).toBe(0);
  });

  it("counts coverage at exactly 15 minutes", () => {
    const stats = computeHourlyStats(
      [session("2026-07-09T11:00:00Z", "2026-07-09T11:15:00Z")],
      NOW,
    );
    expect(stats[0]!.buckets[BUCKET_THU_11]!.probability).toBe(1);
  });

  it("applies recency-weighted proportion across the full window", () => {
    // Anchor earliest data 26 weeks back so all 26 weeks are observed, then
    // cover the Thursday-11:00 bucket only in weeks 1 and 2.
    const anchorStart = new Date(NOW.getTime() - 26 * WEEK_MS);
    const anchorEnd = new Date(anchorStart.getTime() + 20 * 60 * 1000);
    const stats = computeHourlyStats(
      [
        { stationPrefix: "EGKK", facilityType: "TWR", startedAt: anchorStart, endedAt: anchorEnd },
        session("2026-07-09T11:00:00Z", "2026-07-09T12:00:00Z"), // week 1
        session("2026-07-02T11:00:00Z", "2026-07-02T12:00:00Z"), // week 2
      ],
      NOW,
      { coverageWeeks: new Set(Array.from({ length: 26 }, (_, i) => i + 1)) },
    );

    const bucket = stats[0]!.buckets[BUCKET_THU_11]!;
    // Observed weight = 8*1.5 + 9*1.0 + 9*0.6 = 26.4. Weeks 1 and 2 are both in
    // the 1.5 band, so covered weight = 1.5 + 1.5 = 3.0.
    expect(bucket.sampleWeeks).toBe(26);
    expect(bucket.lowConfidence).toBe(false);
    expect(bucket.probability).toBeCloseTo(3.0 / 26.4, 6);
  });

  it("merges overlapping relief sessions instead of double-counting", () => {
    const stats = computeHourlyStats(
      [
        session("2026-07-09T11:00:00Z", "2026-07-09T11:40:00Z"),
        session("2026-07-09T11:20:00Z", "2026-07-09T12:00:00Z"),
      ],
      NOW,
    );
    // Union is a full hour -> covered; still just one observed week.
    expect(stats[0]!.buckets[BUCKET_THU_11]!.probability).toBe(1);
    expect(stats[0]!.buckets[BUCKET_THU_11]!.sampleWeeks).toBe(1);
  });

  it("ignores week slots with no network-wide coverage", () => {
    clearDataCoverageWeeksCache();
    const anchorStart = new Date(NOW.getTime() - 26 * WEEK_MS);
    const anchorEnd = new Date(anchorStart.getTime() + 20 * 60 * 1000);
    const sessions = [
      { stationPrefix: "EGKK", facilityType: "TWR" as const, startedAt: anchorStart, endedAt: anchorEnd },
      session("2026-07-09T11:00:00Z", "2026-07-09T12:00:00Z"),
    ];
    const coverage = getDataCoverageWeeks(sessions, NOW);
    expect(coverage.has(1)).toBe(true);
    expect(coverage.has(26)).toBe(true);

    const sparseCoverage = new Set([1]);
    const stats = computeHourlyStats(sessions, NOW, { coverageWeeks: sparseCoverage });
    expect(stats[0]!.buckets[BUCKET_THU_11]!.sampleWeeks).toBe(1);
  });
});

describe("predictAt", () => {
  const buckets: HourlyStat[] = Array.from({ length: 168 }, (_, i) => ({
    hourOfWeek: i,
    probability: i === BUCKET_THU_11 ? 0.75 : 0,
    sampleWeeks: i === BUCKET_THU_11 ? 10 : 0,
    lowConfidence: i !== BUCKET_THU_11,
  }));

  it("returns the historical bucket probability", () => {
    const result = predictAt(buckets, [], "EGKK", "TWR", new Date("2026-07-09T11:30:00Z"));
    expect(result.source).toBe("history");
    expect(result.probability).toBe(0.75);
    expect(result.confidence).toBe("normal");
    expect(result.sampleWeeks).toBe(10);
  });

  it("flags low confidence for sparse buckets", () => {
    const result = predictAt(buckets, [], "EGKK", "TWR", new Date("2026-07-09T09:30:00Z"));
    expect(result.confidence).toBe("low");
  });

  it("overrides with a covering booking", () => {
    const bookings: BookingInterval[] = [
      {
        stationPrefix: "EGKK",
        facilityType: "TWR",
        startsAt: new Date("2026-07-09T11:00:00Z"),
        endsAt: new Date("2026-07-09T13:00:00Z"),
      },
    ];
    const result = predictAt(buckets, bookings, "EGKK", "TWR", new Date("2026-07-09T11:30:00Z"));
    expect(result.source).toBe("booking");
    expect(result.probability).toBe(BOOKING_PROBABILITY);
    expect(result.confidence).toBe("normal");
  });

  it("does not apply bookings for a different facility", () => {
    const bookings: BookingInterval[] = [
      {
        stationPrefix: "EGKK",
        facilityType: "GND",
        startsAt: new Date("2026-07-09T11:00:00Z"),
        endsAt: new Date("2026-07-09T13:00:00Z"),
      },
    ];
    const result = predictAt(buckets, bookings, "EGKK", "TWR", new Date("2026-07-09T11:30:00Z"));
    expect(result.source).toBe("history");
  });

  it("returns an empty low-confidence result when no stats exist", () => {
    const result = predictAt(undefined, [], "EGKK", "TWR", NOW);
    expect(result).toEqual({
      probability: 0,
      confidence: "low",
      source: "history",
      sampleWeeks: 0,
    });
  });
});

describe("averageProbabilityOverWindow", () => {
  const buckets: HourlyStat[] = Array.from({ length: 168 }, (_, i) => ({
    hourOfWeek: i,
    probability: 0.5,
    sampleWeeks: 10,
    lowConfidence: false,
  }));

  it("averages hourly probabilities across the window", () => {
    const result = averageProbabilityOverWindow(
      buckets,
      [],
      "EGKK",
      "TWR",
      new Date("2026-07-09T11:00:00Z"),
      new Date("2026-07-09T14:00:00Z"),
    );
    expect(result.probability).toBeCloseTo(0.5, 6);
    expect(result.source).toBe("history");
  });

  it("reports a booking source when any hour is booked", () => {
    const bookings: BookingInterval[] = [
      {
        stationPrefix: "EGKK",
        facilityType: "TWR",
        startsAt: new Date("2026-07-09T12:00:00Z"),
        endsAt: new Date("2026-07-09T13:00:00Z"),
      },
    ];
    const result = averageProbabilityOverWindow(
      buckets,
      bookings,
      "EGKK",
      "TWR",
      new Date("2026-07-09T11:00:00Z"),
      new Date("2026-07-09T14:00:00Z"),
    );
    expect(result.source).toBe("booking");
    // Two history hours at 0.5 plus one booked hour at 0.9 -> mean 0.633.
    expect(result.probability).toBeCloseTo((0.5 + BOOKING_PROBABILITY + 0.5) / 3, 6);
  });
});
