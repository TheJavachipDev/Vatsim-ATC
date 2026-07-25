import { parseCallsign } from "./callsign.js";
import { PRIMARY_FACILITY_TYPES, type FacilityType } from "./types.js";

/** A controller position at a station — facility type plus optional sector infix. */
export interface PositionRef {
  facilityType: FacilityType;
  /** Sector / relief designator from the callsign, or null for a generic position. */
  infix: string | null;
}

const DEFAULT_AIRPORT_FACILITIES: FacilityType[] = ["GND", "TWR", "APP", "CTR"];
const DEFAULT_OFFLINE_FACILITIES = DEFAULT_AIRPORT_FACILITIES;
/** Fallback offline cards for Center / FSS / UIR facilities. */
export const DEFAULT_CONTROL_FACILITIES: FacilityType[] = ["CTR", "FSS"];
export { DEFAULT_AIRPORT_FACILITIES };

function slotKey(slot: PositionRef): string {
  return `${slot.facilityType}\0${slot.infix ?? ""}`;
}

/** Derive facility + infix from a VATSIM callsign. */
export function positionFromCallsign(
  callsign: string,
  facilityType?: FacilityType,
): PositionRef {
  const parsed = parseCallsign(callsign);
  return {
    facilityType: facilityType ?? parsed.facilityType,
    infix: parsed.infix,
  };
}

/**
 * Whether a slot is staffed.
 *
 * A generic controller (no infix) covers every sector for that facility.
 * A sector controller only covers its own infix.
 */
export function isPositionCovered(slot: PositionRef, online: readonly PositionRef[]): boolean {
  return online.some((session) => {
    if (session.facilityType !== slot.facilityType) return false;
    if (session.infix === null) return true;
    return session.infix === slot.infix;
  });
}

function addPosition(
  map: Map<FacilityType, { infixes: Set<string>; generic: boolean }>,
  position: PositionRef,
): void {
  let entry = map.get(position.facilityType);
  if (!entry) {
    entry = { infixes: new Set(), generic: false };
    map.set(position.facilityType, entry);
  }
  if (position.infix === null) entry.generic = true;
  else entry.infixes.add(position.infix);
}

/**
 * Build the set of position slots worth showing for a station.
 *
 * When sectors are known (e.g. N/S ground), each gets its own slot. A generic
 * slot is included only when generic positions have been seen before — so
 * `EGKK_GND` can cover both sectors during quiet periods without implying a
 * third always-empty sector card.
 *
 * @param fallbackFacilities — when nothing is known yet, which generic facility
 *   cards to show offline. Defaults to airport positions (GND/TWR/APP/CTR).
 *   Pass `DEFAULT_CONTROL_FACILITIES` for Center / FSS stations.
 */
export function collectKnownPositionSlots(
  sources: readonly (readonly PositionRef[])[],
  fallbackFacilities: readonly FacilityType[] = DEFAULT_OFFLINE_FACILITIES,
): PositionRef[] {
  const byFacility = new Map<FacilityType, { infixes: Set<string>; generic: boolean }>();

  for (const list of sources) {
    for (const position of list) addPosition(byFacility, position);
  }

  if (byFacility.size === 0) {
    return fallbackFacilities.map((facilityType) => ({ facilityType, infix: null }));
  }

  const present = new Set(byFacility.keys());
  const ordered: FacilityType[] = [];
  for (const facility of PRIMARY_FACILITY_TYPES) {
    if (present.has(facility)) ordered.push(facility);
  }
  for (const facility of present) {
    if (!ordered.includes(facility)) ordered.push(facility);
  }

  const slots: PositionRef[] = [];
  const seen = new Set<string>();

  for (const facilityType of ordered) {
    const entry = byFacility.get(facilityType)!;
    for (const infix of [...entry.infixes].sort()) {
      const slot = { facilityType, infix };
      const key = slotKey(slot);
      if (!seen.has(key)) {
        seen.add(key);
        slots.push(slot);
      }
    }
    if (entry.generic || entry.infixes.size === 0) {
      const slot = { facilityType, infix: null };
      const key = slotKey(slot);
      if (!seen.has(key)) {
        seen.add(key);
        slots.push(slot);
      }
    }
  }

  return slots;
}

/**
 * Offline slots that are not covered by anyone currently online.
 *
 * When an entire facility is unmanned, collapse to a single generic card
 * (e.g. "GND not staffed") instead of listing every known sector. When at
 * least one controller is online for that facility, only the missing sector
 * slots are shown — the generic slot itself is never an offline card while
 * sector coverage exists.
 */
export function uncoveredPositionSlots(
  known: readonly PositionRef[],
  online: readonly PositionRef[],
): PositionRef[] {
  const uncovered = known.filter((slot) => !isPositionCovered(slot, online));
  const onlineFacilities = new Set(online.map((session) => session.facilityType));

  const byFacility = new Map<FacilityType, PositionRef[]>();
  for (const slot of uncovered) {
    const list = byFacility.get(slot.facilityType) ?? [];
    list.push(slot);
    byFacility.set(slot.facilityType, list);
  }

  const result: PositionRef[] = [];
  for (const [facilityType, slots] of byFacility) {
    if (!onlineFacilities.has(facilityType)) {
      result.push({ facilityType, infix: null });
      continue;
    }
    for (const slot of slots) {
      if (slot.infix !== null) result.push(slot);
    }
  }

  return result;
}

/** Display label for an offline position slot. */
export function formatPositionSlotLabel(stationPrefix: string, slot: PositionRef): string {
  if (slot.infix === null) return slot.facilityType;
  return `${stationPrefix}_${slot.infix}_${slot.facilityType}`;
}
