/**
 * Very rough ICAO-prefix -> region grouping for the home-page "currently online"
 * strip. This is a display heuristic, not authoritative VATSIM division data:
 * we map by the leading one or two characters of the station prefix. Longer,
 * more specific prefixes take precedence over shorter ones.
 */
const REGION_RULES: ReadonlyArray<readonly [string, string]> = [
  ["EGG", "United Kingdom"],
  ["EG", "United Kingdom"],
  ["EI", "Ireland"],
  ["LON", "United Kingdom"],
  ["ED", "Germany"],
  ["ET", "Germany"],
  ["LF", "France"],
  ["LE", "Spain"],
  ["LP", "Portugal"],
  ["LI", "Italy"],
  ["LOWW", "Austria"],
  ["LO", "Austria"],
  ["LS", "Switzerland"],
  ["EH", "Netherlands"],
  ["EB", "Belgium"],
  ["EK", "Scandinavia"],
  ["EN", "Scandinavia"],
  ["ES", "Scandinavia"],
  ["EF", "Scandinavia"],
  ["EP", "Poland"],
  ["LK", "Czechia"],
  ["LZ", "Slovakia"],
  ["LH", "Hungary"],
  ["U", "Russia & CIS"],
  ["K", "United States"],
  ["PA", "United States"],
  ["PH", "United States"],
  ["C", "Canada"],
  ["M", "Mexico & Central America"],
  ["S", "South America"],
  ["Y", "Australia"],
  ["NZ", "New Zealand"],
  ["R", "East Asia"],
  ["Z", "China"],
  ["V", "South & Southeast Asia"],
  ["O", "Middle East"],
  ["F", "Southern Africa"],
  ["D", "West Africa"],
  ["H", "East Africa"],
];

function matchRegion(prefix: string): string | null {
  let best: { region: string; length: number } | null = null;
  for (const [needle, region] of REGION_RULES) {
    if (prefix.startsWith(needle) && (best === null || needle.length > best.length)) {
      best = { region, length: needle.length };
    }
  }
  return best?.region ?? null;
}

export function regionForPrefix(stationPrefix: string): string {
  const prefix = stationPrefix.trim().toUpperCase();
  const direct = matchRegion(prefix);
  if (direct) return direct;

  // US/CA controllers often drop the country letter (JAX_TWR for KJAX).
  if (/^[A-Z]{3}$/.test(prefix)) {
    return matchRegion(`K${prefix}`) ?? matchRegion(`C${prefix}`) ?? "Other";
  }

  return "Other";
}
