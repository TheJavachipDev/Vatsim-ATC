import type { FacilityType, SessionInterval } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface StationDef {
  prefix: string;
  name: string;
  /** Active UTC hour window [open, close). */
  open: number;
  close: number;
  facilities: FacilityType[];
}

export const SEED_STATIONS: StationDef[] = [
  { prefix: "EGKK", name: "London Gatwick", open: 6, close: 22, facilities: ["DEL", "GND", "TWR", "APP"] },
  { prefix: "EGLL", name: "London Heathrow", open: 6, close: 23, facilities: ["DEL", "GND", "TWR", "APP"] },
  { prefix: "EDDF", name: "Frankfurt", open: 6, close: 22, facilities: ["DEL", "GND", "TWR", "APP"] },
  { prefix: "EDDM", name: "Munich", open: 7, close: 21, facilities: ["GND", "TWR", "APP"] },
  { prefix: "LFPG", name: "Paris Charles de Gaulle", open: 6, close: 22, facilities: ["GND", "TWR", "APP"] },
  { prefix: "EHAM", name: "Amsterdam Schiphol", open: 6, close: 22, facilities: ["DEL", "GND", "TWR", "APP"] },
  { prefix: "LON", name: "London Control", open: 6, close: 23, facilities: ["CTR"] },
  { prefix: "KJFK", name: "New York JFK", open: 12, close: 4, facilities: ["GND", "TWR", "APP"] },
  { prefix: "KLAX", name: "Los Angeles", open: 15, close: 6, facilities: ["GND", "TWR"] },
];

const BASE_PROB: Record<string, number> = {
  DEL: 0.28,
  GND: 0.4,
  TWR: 0.55,
  APP: 0.6,
  CTR: 0.68,
};

export interface GeneratedSeedSession {
  externalId: string;
  cid: number;
  callsign: string;
  stationPrefix: string;
  infix: null;
  facilityType: FacilityType;
  rating: number;
  startedAt: Date;
  endedAt: Date;
}

export interface GenerateSeedSessionsOptions {
  weeks?: number;
  now?: Date;
  seed?: number;
  stations?: StationDef[];
}

export interface GenerateSeedSessionsResult {
  sessions: GeneratedSeedSession[];
  intervals: SessionInterval[];
  stations: StationDef[];
}

/** Simple mulberry32 PRNG for reproducible seeds. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultSeedStationDef(prefix: string, name?: string | null): StationDef {
  const p = prefix.trim().toUpperCase();
  const label = name?.trim() || p;

  if (p.length <= 3 || p.includes("-")) {
    return { prefix: p, name: label, open: 6, close: 23, facilities: ["CTR", "FSS"] };
  }

  if (p.startsWith("K")) {
    return { prefix: p, name: label, open: 14, close: 4, facilities: ["GND", "TWR", "APP"] };
  }

  if (p.startsWith("E")) {
    return { prefix: p, name: label, open: 6, close: 22, facilities: ["GND", "TWR", "APP"] };
  }

  return { prefix: p, name: label, open: 8, close: 20, facilities: ["GND", "TWR", "APP"] };
}

/** Stable numeric seed from a station prefix for reproducible synthetic sessions. */
export function seedForPrefix(prefix: string): number {
  let h = 0;
  const p = prefix.trim().toUpperCase();
  for (let i = 0; i < p.length; i += 1) {
    h = (Math.imul(31, h) + p.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

function inWindow(hour: number, open: number, close: number): boolean {
  return open <= close ? hour >= open && hour < close : hour >= open || hour < close;
}

function hourProbability(station: StationDef, facility: FacilityType, hour: number, dow: number): number {
  const base = BASE_PROB[facility] ?? 0.3;
  if (!inWindow(hour, station.open, station.close)) return 0.02;
  const weekend = dow === 5 || dow === 6 || dow === 0 ? 1.3 : 1;
  return Math.min(0.95, base * weekend);
}

/**
 * Deterministic synthetic session generator used by `db:seed` and backfill
 * `--seed` when the VATSIM history API is unavailable.
 */
export function generateSeedSessions(
  options: GenerateSeedSessionsOptions = {},
): GenerateSeedSessionsResult {
  const now = options.now ?? new Date();
  const weeks = options.weeks ?? 8;
  const days = weeks * 7;
  const stations = options.stations ?? SEED_STATIONS;
  const rng = makeRng(options.seed ?? 20260709);

  const sessions: GeneratedSeedSession[] = [];
  const intervals: SessionInterval[] = [];
  let cid = 800000;

  for (const station of stations) {
    for (let dayAgo = 1; dayAgo <= days; dayAgo += 1) {
      const dayStart = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS - dayAgo * DAY_MS);
      const dow = dayStart.getUTCDay();

      for (const facility of station.facilities) {
        let runStart: number | null = null;
        for (let hour = 0; hour <= 24; hour += 1) {
          const staffed = hour < 24 && rng() < hourProbability(station, facility, hour, dow);
          if (staffed && runStart === null) {
            runStart = hour;
          } else if (!staffed && runStart !== null) {
            const startOffsetMin = Math.floor(rng() * 8);
            const endOffsetMin = Math.floor(rng() * 8);
            const startedAt = new Date(dayStart.getTime() + runStart * HOUR_MS + startOffsetMin * 60_000);
            const endedAt = new Date(dayStart.getTime() + hour * HOUR_MS - endOffsetMin * 60_000);
            if (endedAt.getTime() - startedAt.getTime() >= 20 * 60_000) {
              const callsign = `${station.prefix}_${facility}`;
              const externalId = `seed:${station.prefix}:${facility}:${startedAt.getTime()}`;
              sessions.push({
                externalId,
                cid: cid++,
                callsign,
                stationPrefix: station.prefix,
                infix: null,
                facilityType: facility,
                rating: 3,
                startedAt,
                endedAt,
              });
              intervals.push({ stationPrefix: station.prefix, facilityType: facility, startedAt, endedAt });
            }
            runStart = null;
          }
        }
      }
    }
  }

  return { sessions, intervals, stations };
}
