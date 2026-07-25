import { FACILITY_TYPES, type FacilityType, type ParsedCallsign } from "./types.js";

const KNOWN_FACILITIES = new Set<string>(FACILITY_TYPES);

/** VATSIM datafeed `facility` integer → our facility suffix. */
const VATSIM_FACILITY_BY_ID: Record<number, FacilityType> = {
  1: "FSS",
  2: "DEL",
  3: "GND",
  4: "TWR",
  5: "APP",
  6: "CTR",
};

export function facilityFromVatsimId(facilityId: number): FacilityType | null {
  return VATSIM_FACILITY_BY_ID[facilityId] ?? null;
}

export interface ParseCallsignOptions {
  /** When the callsign suffix is unknown, fall back to the datafeed facility id. */
  vatsimFacility?: number;
}

/**
 * Parse a controller callsign into structured form.
 *
 * The last underscore segment is the facility type, the first is the station
 * prefix, and anything in between is the infix (relief / sector designator).
 * Examples: `EGKK_TWR`, `EGKK_1_GND`, `LON_S_CTR`, `EKDK_D_CTR`, `RU-SC_FSS`.
 */
export function parseCallsign(callsign: string, options?: ParseCallsignOptions): ParsedCallsign {
  const normalized = callsign.trim().toUpperCase();
  const segments = normalized.split("_").filter((s) => s.length > 0);

  if (segments.length === 0) {
    return {
      callsign: normalized,
      stationPrefix: normalized,
      infix: null,
      facilityType: "OTHER",
    };
  }

  if (segments.length === 1) {
    return {
      callsign: normalized,
      stationPrefix: segments[0]!,
      infix: null,
      facilityType: "OTHER",
    };
  }

  const lastSegment = segments[segments.length - 1]!;
  let facilityType: FacilityType = KNOWN_FACILITIES.has(lastSegment)
    ? (lastSegment as FacilityType)
    : "OTHER";

  if (facilityType === "OTHER" && options?.vatsimFacility !== undefined) {
    const fromFeed = facilityFromVatsimId(options.vatsimFacility);
    if (fromFeed) facilityType = fromFeed;
  }

  const stationPrefix = segments[0]!;
  const middle = segments.slice(1, -1);
  const infix = middle.length > 0 ? middle.join("_") : null;

  return { callsign: normalized, stationPrefix, infix, facilityType };
}

/** True for observer connections that must be ignored by the collector. */
export function isObserverCallsign(callsign: string): boolean {
  return callsign.trim().toUpperCase().includes("_OBS");
}
