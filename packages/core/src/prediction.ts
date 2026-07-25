import type {
  BookingInterval,
  FacilityType,
  HourlyStat,
  PredictionResult,
  SessionInterval,
} from "./types.js";

export const HOURS_PER_WEEK = 168;
export const WINDOW_WEEKS = 26;
export const MIN_COVERAGE_MINUTES = 15;
export const LOW_CONFIDENCE_WEEKS = 4;
export const BOOKING_PROBABILITY = 0.9;

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = HOURS_PER_WEEK * HOUR_MS;

/** Hour-of-week bucket in UTC: 0 = Sunday 00:00, 167 = Saturday 23:00. */
export function hourOfWeek(date: Date): number {
  return date.getUTCDay() * 24 + date.getUTCHours();
}

/**
 * Recency weight for a week slot, where slot 1 is the most recent week.
 * Weeks 1-8 count 1.5x, 9-17 count 1.0x, 18-26 count 0.6x.
 */
export function weekWeight(weekSlot: number): number {
  if (weekSlot <= 8) return 1.5;
  if (weekSlot <= 17) return 1.0;
  return 0.6;
}

/**
 * Week slots (1 = most recent) that have ANY session network-wide in the rolling
 * window. Used to avoid deflating probabilities when backfill has gaps.
 */
export function getDataCoverageWeeks(sessions: SessionInterval[], now: Date): Set<number> {
  const windowEnd = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const covered = new Set<number>();
  const totalCells = WINDOW_WEEKS * HOURS_PER_WEEK;

  for (const session of sessions) {
    const start = session.startedAt.getTime();
    const end = (session.endedAt ?? now).getTime();
    if (end <= start) continue;

    for (let i = 0; i < totalCells; i += 1) {
      const cellStart = windowEnd - (i + 1) * HOUR_MS;
      const cellEnd = windowEnd - i * HOUR_MS;
      if (end > cellStart && start < cellEnd) {
        covered.add(Math.floor(i / HOURS_PER_WEEK) + 1);
      }
    }
  }

  return covered;
}

let coverageCache: { hourBucket: number; weeks: Set<number> } | null = null;

/** Cached hourly wrapper around {@link getDataCoverageWeeks}. */
export function getDataCoverageWeeksCached(sessions: SessionInterval[], now: Date): Set<number> {
  const hourBucket = Math.floor(now.getTime() / HOUR_MS);
  if (coverageCache?.hourBucket === hourBucket) {
    return coverageCache.weeks;
  }
  const weeks = getDataCoverageWeeks(sessions, now);
  coverageCache = { hourBucket, weeks };
  return weeks;
}

/** Test helper — reset the hourly coverage cache. */
export function clearDataCoverageWeeksCache(): void {
  coverageCache = null;
}

export interface StationFacilityStats {
  stationPrefix: string;
  facilityType: FacilityType;
  /** Exactly 168 buckets, indexed by hour-of-week. */
  buckets: HourlyStat[];
}

interface Interval {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent intervals so relief controllers count as one. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Total minutes of `intervals` overlapping the half-open cell [cellStart, cellEnd). */
function coverageMinutes(
  intervals: Interval[],
  cellStart: number,
  cellEnd: number,
): number {
  let ms = 0;
  for (const interval of intervals) {
    if (interval.end <= cellStart || interval.start >= cellEnd) continue;
    ms += Math.min(interval.end, cellEnd) - Math.max(interval.start, cellStart);
  }
  return ms / 60000;
}

function groupKey(stationPrefix: string, facilityType: FacilityType): string {
  return `${stationPrefix}\u0000${facilityType}`;
}

/**
 * Materialize per-(station, facility) hour-of-week coverage probabilities over
 * the rolling window ending at `now`. For each hour-of-week bucket we look at
 * the corresponding hour in each of the last 26 weeks, decide whether it had at
 * least 15 minutes of coverage, and take the recency-weighted proportion of
 * covered weeks over observed weeks (weeks after the station's first session).
 */
export function computeHourlyStats(
  sessions: SessionInterval[],
  now: Date,
  options?: { coverageWeeks?: Set<number> },
): StationFacilityStats[] {
  const windowEnd = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const coverageWeeks = options?.coverageWeeks ?? getDataCoverageWeeksCached(sessions, now);

  const groups = new Map<
    string,
    { stationPrefix: string; facilityType: FacilityType; intervals: Interval[]; earliest: number }
  >();

  for (const session of sessions) {
    const start = session.startedAt.getTime();
    const end = (session.endedAt ?? now).getTime();
    if (end <= start) continue;
    const key = groupKey(session.stationPrefix, session.facilityType);
    let group = groups.get(key);
    if (!group) {
      group = {
        stationPrefix: session.stationPrefix,
        facilityType: session.facilityType,
        intervals: [],
        earliest: start,
      };
      groups.set(key, group);
    }
    group.intervals.push({ start, end });
    if (start < group.earliest) group.earliest = start;
  }

  const results: StationFacilityStats[] = [];

  for (const group of groups.values()) {
    const merged = mergeIntervals(group.intervals);

    const weightedObserved = new Array<number>(HOURS_PER_WEEK).fill(0);
    const weightedCovered = new Array<number>(HOURS_PER_WEEK).fill(0);
    const observedCount = new Array<number>(HOURS_PER_WEEK).fill(0);

    const totalCells = WINDOW_WEEKS * HOURS_PER_WEEK;
    for (let i = 0; i < totalCells; i += 1) {
      const cellStart = windowEnd - (i + 1) * HOUR_MS;
      const cellEnd = windowEnd - i * HOUR_MS;
      if (cellEnd <= group.earliest) continue; // before we had any data
      const weekSlot = Math.floor(i / HOURS_PER_WEEK) + 1;
      if (!coverageWeeks.has(weekSlot)) continue;
      const bucket = hourOfWeek(new Date(cellStart));
      const weight = weekWeight(weekSlot);

      weightedObserved[bucket]! += weight;
      observedCount[bucket]! += 1;
      if (coverageMinutes(merged, cellStart, cellEnd) >= MIN_COVERAGE_MINUTES) {
        weightedCovered[bucket]! += weight;
      }
    }

    const buckets: HourlyStat[] = [];
    for (let b = 0; b < HOURS_PER_WEEK; b += 1) {
      const observed = weightedObserved[b]!;
      const sampleWeeks = observedCount[b]!;
      const probability = observed > 0 ? weightedCovered[b]! / observed : 0;
      buckets.push({
        hourOfWeek: b,
        probability,
        sampleWeeks,
        lowConfidence: sampleWeeks < LOW_CONFIDENCE_WEEKS,
      });
    }

    results.push({
      stationPrefix: group.stationPrefix,
      facilityType: group.facilityType,
      buckets,
    });
  }

  return results;
}

/** True if the booking covers the given instant. */
function bookingCovers(booking: BookingInterval, at: Date): boolean {
  const t = at.getTime();
  return booking.startsAt.getTime() <= t && t < booking.endsAt.getTime();
}

/**
 * Predict coverage for a station + facility at a specific instant. A confirmed
 * booking spanning `at` overrides history with a high fixed probability.
 */
export function predictAt(
  buckets: HourlyStat[] | undefined,
  bookings: BookingInterval[],
  stationPrefix: string,
  facilityType: FacilityType,
  at: Date,
): PredictionResult {
  const covering = bookings.find(
    (b) =>
      b.stationPrefix === stationPrefix &&
      b.facilityType === facilityType &&
      bookingCovers(b, at),
  );
  if (covering) {
    return {
      probability: BOOKING_PROBABILITY,
      confidence: "normal",
      source: "booking",
      sampleWeeks: 0,
    };
  }

  const stat = buckets?.[hourOfWeek(at)];
  if (!stat) {
    return { probability: 0, confidence: "low", source: "history", sampleWeeks: 0 };
  }

  return {
    probability: stat.probability,
    confidence: stat.lowConfidence ? "low" : "normal",
    source: "history",
    sampleWeeks: stat.sampleWeeks,
  };
}

/**
 * Average predicted probability across every whole hour in [from, to), used for
 * the metric cards' selected time window. Booking overrides apply per hour.
 */
export function averageProbabilityOverWindow(
  buckets: HourlyStat[] | undefined,
  bookings: BookingInterval[],
  stationPrefix: string,
  facilityType: FacilityType,
  from: Date,
  to: Date,
): PredictionResult {
  const startHour = Math.floor(from.getTime() / HOUR_MS) * HOUR_MS;
  const endMs = to.getTime();
  let sum = 0;
  let count = 0;
  let sawBooking = false;
  let minSampleWeeks = Number.POSITIVE_INFINITY;
  let anyLowConfidence = false;

  for (let t = startHour; t < endMs; t += HOUR_MS) {
    const result = predictAt(buckets, bookings, stationPrefix, facilityType, new Date(t));
    sum += result.probability;
    count += 1;
    if (result.source === "booking") sawBooking = true;
    if (result.confidence === "low") anyLowConfidence = true;
    minSampleWeeks = Math.min(minSampleWeeks, result.sampleWeeks);
  }

  if (count === 0) {
    return { probability: 0, confidence: "low", source: "history", sampleWeeks: 0 };
  }

  return {
    probability: sum / count,
    confidence: anyLowConfidence ? "low" : "normal",
    source: sawBooking ? "booking" : "history",
    sampleWeeks: Number.isFinite(minSampleWeeks) ? minSampleWeeks : 0,
  };
}
