import type { FacilityType } from "@vatsim-atc/core/client";

/** Human-readable labels for facility types shown in the UI. */
export const FACILITY_LABELS: Record<string, string> = {
  DEL: "Delivery",
  GND: "Ground",
  TWR: "Tower",
  APP: "Approach",
  DEP: "Departure",
  CTR: "Center",
  FSS: "Flight Service",
  ATIS: "ATIS",
  RMP: "Ramp",
  RDO: "Radio",
  TMU: "Traffic Mgmt",
  OTHER: "Other",
};

export function facilityLabel(facility: FacilityType): string {
  return FACILITY_LABELS[facility] ?? facility;
}

import { displayProbability } from "@vatsim-atc/core/client";

/** Tailwind text color class for a probability value. */
export function probabilityTextClass(probability: number, isBooking = false): string {
  const p = displayProbability(probability);
  if (isBooking) return "text-accent-soft";
  if (p >= 0.66) return "text-emerald-400";
  if (p >= 0.33) return "text-amber-300";
  if (p > 0) return "text-zinc-400";
  return "text-zinc-500 dark:text-zinc-500";
}

/** Tailwind background class for probability bars. */
export function probabilityBarClass(probability: number, isBooking = false): string {
  const p = displayProbability(probability);
  if (isBooking) return "bg-accent";
  if (p >= 0.66) return "bg-emerald-500";
  if (p >= 0.33) return "bg-amber-500";
  return "bg-zinc-600";
}
