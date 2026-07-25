/** User-facing probabilities are never shown above 90% — we can't be certain. */
export const MAX_DISPLAY_PROBABILITY = 0.9;

export function displayProbability(probability: number): number {
  if (!Number.isFinite(probability)) return 0;
  return Math.min(Math.max(probability, 0), MAX_DISPLAY_PROBABILITY);
}
