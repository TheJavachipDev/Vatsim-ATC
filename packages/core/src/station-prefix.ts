/**
 * Station prefixes VATSIM controllers actually log on with can differ from the
 * ICAO / catalog id. In the US (and usually Canada), the leading country letter
 * is dropped: KJAX → JAX_TWR, CYYZ → YYZ_TWR.
 */

/** Prefixes to query when looking up live/history data for a station page. */
export function stationLookupPrefixes(prefix: string): string[] {
  const normalized = prefix.trim().toUpperCase();
  if (!normalized) return [];

  const prefixes = new Set<string>([normalized]);

  // US continental ICAO: K + 3 letters ↔ 3-letter VATSIM localizer.
  if (/^K[A-Z]{3}$/.test(normalized)) {
    prefixes.add(normalized.slice(1));
  }

  // Canadian ICAO: C + 3 letters ↔ 3-letter VATSIM localizer.
  if (/^C[A-Z]{3}$/.test(normalized)) {
    prefixes.add(normalized.slice(1));
  }

  return [...prefixes];
}

/**
 * True when two station prefixes refer to the same place under US/CA
 * localizer conventions (exact match or K/C country-letter drop).
 */
export function stationPrefixesMatch(a: string, b: string): boolean {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;

  const leftAliases = stationLookupPrefixes(left);
  const rightAliases = stationLookupPrefixes(right);
  return leftAliases.some((alias) => rightAliases.includes(alias));
}

/**
 * Prefer the ICAO-form prefix (Kxxx / Cxxx) when the short localizer is passed,
 * otherwise return the normalized prefix unchanged.
 */
export function preferIcaoStationPrefix(prefix: string): string {
  const normalized = prefix.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) {
    // Prefer US K-prefix when the caller only has the localizer; Canada C-prefix
    // is handled explicitly by callers that already know the country.
    return `K${normalized}`;
  }
  return normalized;
}
