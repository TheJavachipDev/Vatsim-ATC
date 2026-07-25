/** Station prefixes from VATSIM callsigns (e.g. EGKK, KTPA, LON, RU-SC). */
export function isValidStationPrefix(prefix: string): boolean {
  return /^[A-Z0-9-]{2,10}$/.test(prefix.trim().toUpperCase());
}
