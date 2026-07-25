import { displayProbability } from "@vatsim-atc/core/client";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatPercent(probability: number): string {
  return `${Math.round(displayProbability(probability) * 100)}%`;
}

/** Green intensity ramp for the heatmap; dimmed for low-confidence buckets. */
export function heatStyle(probability: number, lowConfidence: boolean): React.CSSProperties {
  const p = displayProbability(probability);
  if (p <= 0) {
    return { backgroundColor: "rgba(39, 39, 42, 0.65)" };
  }
  const alpha = 0.22 + p * 0.78;
  return {
    backgroundColor: `rgba(52, 211, 153, ${alpha.toFixed(3)})`,
    opacity: lowConfidence ? 0.45 : 1,
  };
}

export function formatUtcHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}00z`;
}

export function formatUtcDateTime(date: Date): string {
  const day = DAY_NAMES[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${dd} ${hh}${mm}z`;
}

export function formatUtcClock(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}${mm}z`;
}
