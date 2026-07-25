import airportsData from "@/data/airports.json";
import facilitiesData from "@/data/facilities.json";
import { isValidStationPrefix } from "./station-prefix";

export interface Airport {
  icao: string;
  /** IATA code when known (e.g. LHR for EGLL, FLL for KFLL). */
  iata?: string;
  /** FAA Location ID for US airports (often same as IATA, e.g. FLL). */
  faa?: string;
  name: string;
}

interface Facility {
  prefix: string;
  name: string;
  aliases?: string[];
}

const airports = airportsData as Airport[];
const facilities = facilitiesData as Facility[];

const byIcao = new Map(airports.map((a) => [a.icao, a]));
const byIata = new Map<string, Airport>();
const byFaa = new Map<string, Airport>();

for (const airport of airports) {
  if (airport.iata && !byIata.has(airport.iata)) {
    byIata.set(airport.iata, airport);
  }
  if (airport.faa && !byFaa.has(airport.faa)) {
    byFaa.set(airport.faa, airport);
  }
}

const facilityByPrefix = new Map(facilities.map((f) => [f.prefix, f]));
const facilityByAlias = new Map<string, Facility>();
for (const facility of facilities) {
  for (const alias of facility.aliases ?? []) {
    facilityByAlias.set(alias, facility);
  }
}

/** Look up an airport by ICAO, IATA, or FAA Location ID. */
export function lookupAirport(code: string): Airport | null {
  const key = code.trim().toUpperCase();
  if (!key) return null;
  return byIcao.get(key) ?? byIata.get(key) ?? byFaa.get(key) ?? null;
}

/** VATSIM Center / FSS / UIR facility (from VATSpy FIR/UIR data). */
export function lookupFacility(id: string): { prefix: string; name: string } | null {
  const key = id.trim().toUpperCase();
  const byPrefix = facilityByPrefix.get(key);
  if (byPrefix) return { prefix: byPrefix.prefix, name: byPrefix.name };
  const byAlias = facilityByAlias.get(key);
  if (byAlias) return { prefix: byAlias.prefix, name: byAlias.name };
  return null;
}

/** Airport or control facility name for a station prefix. */
export function lookupStationName(prefix: string): string | null {
  const key = prefix.trim().toUpperCase();
  if (!key) return null;

  // Exact ICAO airport (CYVR → Vancouver Int'l).
  const icaoAirport = byIcao.get(key);
  if (icaoAirport) return icaoAirport.name;

  // Exact Center/FSS prefix (CZVR, LON).
  const facilityExact = facilityByPrefix.get(key);
  if (facilityExact) return facilityExact.name;

  // IATA / FAA before facility aliases so VAN → Van Ferit Melen, not Vancouver Centre.
  const shortAirport = byIata.get(key) ?? byFaa.get(key);
  if (shortAirport) return shortAirport.name;

  const facilityAlias = facilityByAlias.get(key);
  if (facilityAlias) return facilityAlias.name;

  // US/CA localizers without an IATA/FAA row still map via country letter.
  if (/^[A-Z]{3}$/.test(key)) {
    return byIcao.get(`K${key}`)?.name ?? byIcao.get(`C${key}`)?.name ?? null;
  }

  return null;
}

/** True when this prefix is a known Center / FSS / UIR facility (not an airport). */
export function isControlFacility(prefix: string): boolean {
  const key = prefix.trim().toUpperCase();
  // Exact ICAO airports are never treated as centers, even if VATSpy also lists them.
  if (byIcao.has(key)) return false;
  // IATA/FAA airport codes win over facility aliases (VAN is LTCI, not CZVR).
  if (byIata.has(key) || byFaa.has(key)) return false;
  return lookupFacility(key) !== null;
}

/**
 * Resolve search / URL input to the canonical station prefix (ICAO).
 * - Exact airport ICAO: CYVR
 * - Exact facility prefix: CZVR, LON
 * - IATA / FAA → airport ICAO: VAN → LTCI, FLL → KFLL
 * - Facility aliases: EGTT → LON
 * - US/CA 3-letter localizer fallback when IATA/FAA is missing
 */
export function resolveStationPrefix(prefix: string): string {
  const key = prefix.trim().toUpperCase();
  if (!key) return key;

  if (byIcao.has(key)) return key;

  const facilityExact = facilityByPrefix.get(key);
  if (facilityExact) return facilityExact.prefix;

  const shortAirport = byIata.get(key) ?? byFaa.get(key);
  if (shortAirport) return shortAirport.icao;

  const facilityAlias = facilityByAlias.get(key);
  if (facilityAlias) return facilityAlias.prefix;

  if (/^[A-Z]{3}$/.test(key)) {
    if (byIcao.has(`K${key}`)) return `K${key}`;
    if (byIcao.has(`C${key}`)) return `C${key}`;
  }

  return key;
}

export function searchAirports(
  query: string,
  limit = 10,
): { prefix: string; name: string; iata?: string; faa?: string }[] {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return [];

  const results: { prefix: string; name: string; iata?: string; faa?: string }[] = [];
  const seen = new Set<string>();

  const push = (airport: Airport) => {
    if (seen.has(airport.icao) || results.length >= limit) return;
    seen.add(airport.icao);
    results.push({
      prefix: airport.icao,
      name: airport.name,
      ...(airport.iata ? { iata: airport.iata } : {}),
      ...(airport.faa ? { faa: airport.faa } : {}),
    });
  };

  // Exact ICAO / IATA / FAA hit first (KFLL, FLL, EGLL, LHR).
  const exact = lookupAirport(q);
  if (exact) push(exact);

  // ICAO prefix match — airports.json is sorted by icao.
  let lo = 0;
  let hi = airports.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midIcao = airports[mid]?.icao ?? "";
    if (midIcao < q) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < airports.length && results.length < limit; i++) {
    const airport = airports[i];
    if (!airport?.icao.startsWith(q)) break;
    push(airport);
  }

  // IATA / FAA prefix match.
  if (results.length < limit && q.length >= 2 && q.length <= 4) {
    for (const airport of airports) {
      if (airport.iata?.startsWith(q) || airport.faa?.startsWith(q)) {
        push(airport);
        if (results.length >= limit) break;
      }
    }
  }

  // Name substring match when the query looks like a place name.
  if (results.length < limit && q.length >= 3 && /[A-Z]/.test(q)) {
    for (const airport of airports) {
      if (airport.name.toUpperCase().includes(q)) {
        push(airport);
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

export function searchFacilities(
  query: string,
  limit = 10,
): { prefix: string; name: string }[] {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return [];

  const results: { prefix: string; name: string }[] = [];
  const seen = new Set<string>();

  const push = (facility: Facility) => {
    if (seen.has(facility.prefix) || results.length >= limit) return;
    seen.add(facility.prefix);
    results.push({ prefix: facility.prefix, name: facility.name });
  };

  for (const facility of facilities) {
    if (facility.prefix.startsWith(q)) push(facility);
    if (results.length >= limit) return results;
  }

  for (const facility of facilities) {
    for (const alias of facility.aliases ?? []) {
      if (alias.startsWith(q)) {
        push(facility);
        break;
      }
    }
    if (results.length >= limit) return results;
  }

  if (results.length < limit && q.length >= 3) {
    for (const facility of facilities) {
      if (facility.name.toUpperCase().includes(q)) push(facility);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/** Merge airports, control facilities, and any live DB prefixes. */
export function searchStationSuggestions(
  query: string,
  dbResults: { prefix: string; name: string | null }[],
  limit = 10,
): { prefix: string; name: string | null }[] {
  const q = query.trim();
  if (q.length === 0) return [];

  const upper = q.toUpperCase();
  const byPrefix = new Map<string, { prefix: string; name: string | null }>();

  for (const row of searchAirports(q, limit)) {
    byPrefix.set(row.prefix, { prefix: row.prefix, name: row.name });
  }

  for (const row of searchFacilities(q, limit)) {
    const existing = byPrefix.get(row.prefix);
    byPrefix.set(row.prefix, {
      prefix: row.prefix,
      name: existing?.name ?? row.name,
    });
  }

  for (const row of dbResults) {
    const existing = byPrefix.get(row.prefix);
    byPrefix.set(row.prefix, {
      prefix: row.prefix,
      name: row.name ?? existing?.name ?? lookupStationName(row.prefix),
    });
  }

  if (isValidStationPrefix(upper) && /^[A-Z0-9-]+$/.test(upper)) {
    const facility = lookupFacility(upper);
    if (facility) {
      const existing = byPrefix.get(facility.prefix);
      byPrefix.set(facility.prefix, {
        prefix: facility.prefix,
        name: existing?.name ?? facility.name,
      });
    } else {
      const airport = lookupAirport(upper);
      if (airport) {
        byPrefix.set(airport.icao, {
          prefix: airport.icao,
          name: airport.name,
        });
      } else if (!byPrefix.has(upper)) {
        byPrefix.set(upper, {
          prefix: upper,
          name: lookupStationName(upper),
        });
      }
    }
  }

  const resolvedUpper = resolveStationPrefix(upper);

  return [...byPrefix.values()]
    .sort((a, b) => {
      if (a.prefix === resolvedUpper) return -1;
      if (b.prefix === resolvedUpper) return 1;
      if (a.prefix === upper) return -1;
      if (b.prefix === upper) return 1;
      const aStarts = a.prefix.startsWith(upper) ? 0 : 1;
      const bStarts = b.prefix.startsWith(upper) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.prefix.localeCompare(b.prefix);
    })
    .slice(0, limit);
}
