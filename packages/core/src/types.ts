/** Known ATC facility suffixes. Anything unrecognized is bucketed as OTHER. */
export const FACILITY_TYPES = [
  "DEL",
  "GND",
  "TWR",
  "APP",
  "DEP",
  "CTR",
  "FSS",
  "ATIS",
  "RMP",
  "RDO",
  "TMU",
  "OTHER",
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Facility types surfaced in the UI/metric cards, in display order. */
export const PRIMARY_FACILITY_TYPES = [
  "DEL",
  "GND",
  "TWR",
  "APP",
  "DEP",
  "CTR",
  "FSS",
] as const satisfies readonly FacilityType[];

export interface ParsedCallsign {
  /** Original callsign, uppercased. */
  callsign: string;
  /** First underscore-separated segment, e.g. `EGKK` or `LON`. */
  stationPrefix: string;
  /** Middle segment(s) joined by `_`, or null when there are none. */
  infix: string | null;
  /** Last segment mapped to a known facility type, else `OTHER`. */
  facilityType: FacilityType;
}

export type PredictionConfidence = "low" | "normal";
export type PredictionSource = "history" | "booking";

export interface PredictionResult {
  probability: number;
  confidence: PredictionConfidence;
  source: PredictionSource;
  sampleWeeks: number;
}

/** One materialized hour-of-week bucket for a given station + facility. */
export interface HourlyStat {
  hourOfWeek: number;
  probability: number;
  sampleWeeks: number;
  lowConfidence: boolean;
}

/** Minimal session shape the prediction engine needs (persistence-agnostic). */
export interface SessionInterval {
  stationPrefix: string;
  facilityType: FacilityType;
  startedAt: Date;
  /** Null means still open; treated as `now` by consumers when needed. */
  endedAt: Date | null;
}

/** Minimal booking shape the prediction engine needs. */
export interface BookingInterval {
  stationPrefix: string;
  facilityType: FacilityType;
  startsAt: Date;
  endsAt: Date;
}
