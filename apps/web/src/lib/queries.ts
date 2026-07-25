import {
  HOURS_PER_WEEK,
  WINDOW_WEEKS,
  computeHourlyStats,
  dbSchema,
  regionForPrefix,
  stationLookupPrefixes,
  type BookingInterval,
  type FacilityType,
  type HourlyStat,
  type PositionRef,
} from "@vatsim-atc/core";
import { and, asc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { lookupAirport, lookupStationName, searchStationSuggestions } from "./airport-search";
import { getDb } from "./db";
import {
  fetchLiveRegionSummary,
  fetchLiveSessions,
  fetchLiveTotalOnline,
} from "./live-datafeed";

const { sessions, bookings, stations } = dbSchema;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface StationSummary {
  prefix: string;
  name: string | null;
  iata?: string | null;
  faa?: string | null;
}

export interface OpenSession {
  cid: number;
  callsign: string;
  facilityType: FacilityType;
  infix: string | null;
  frequency: string | null;
  startedAt: Date;
}

export interface UpcomingBooking {
  callsign: string;
  facilityType: FacilityType;
  startsAt: Date;
  endsAt: Date;
  type: string | null;
}

export async function searchStations(query: string, limit = 10): Promise<StationSummary[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ prefix: stations.prefix, name: stations.name })
    .from(stations)
    .where(ilike(stations.prefix, `${q}%`))
    .orderBy(asc(stations.prefix))
    .limit(limit);
  return searchStationSuggestions(q, rows, limit).map((row) => {
    const airport = lookupAirport(row.prefix);
    return {
      prefix: row.prefix,
      name: row.name,
      iata: airport?.iata ?? null,
      faa: airport?.faa ?? null,
    };
  });
}

export async function getStation(prefix: string): Promise<StationSummary | null> {
  const db = getDb();
  const normalized = prefix.trim().toUpperCase();
  const rows = await db
    .select({ prefix: stations.prefix, name: stations.name })
    .from(stations)
    .where(eq(stations.prefix, normalized))
    .limit(1);
  const row = rows[0];
  const airport = lookupAirport(normalized);
  const catalogName = lookupStationName(normalized);
  const iata = airport?.iata ?? null;
  const faa = airport?.faa ?? null;
  if (row) {
    return { prefix: row.prefix, name: row.name ?? catalogName, iata, faa };
  }

  if (!catalogName) return null;
  return { prefix: normalized, name: catalogName, iata, faa };
}

export async function getOpenSessions(prefix: string): Promise<OpenSession[]> {
  // Always prefer the live VATSIM datafeed when reachable — even an empty
  // result means nobody is online right now. DB open sessions are a fallback
  // only when the datafeed is unavailable.
  try {
    return await fetchLiveSessions(prefix);
  } catch {
    /* fall through to DB */
  }

  const db = getDb();
  const prefixes = stationLookupPrefixes(prefix);
  const rows = await db
    .select({
      cid: sessions.cid,
      callsign: sessions.callsign,
      facilityType: sessions.facilityType,
      infix: sessions.infix,
      frequency: sessions.frequency,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(and(inArray(sessions.stationPrefix, prefixes), isNull(sessions.endedAt)))
    .orderBy(asc(sessions.facilityType));
  return rows.map((row) => ({
    ...row,
    infix: row.infix ?? null,
    facilityType: row.facilityType as FacilityType,
  }));
}

/** Distinct facility/infix combinations seen in collector history for a station. */
export async function getKnownPositionRefs(prefix: string): Promise<PositionRef[]> {
  const db = getDb();
  const prefixes = stationLookupPrefixes(prefix);
  const rows = await db
    .selectDistinct({
      facilityType: sessions.facilityType,
      infix: sessions.infix,
    })
    .from(sessions)
    .where(inArray(sessions.stationPrefix, prefixes));

  return rows.map((row) => ({
    facilityType: row.facilityType as FacilityType,
    infix: row.infix ?? null,
  }));
}

export async function getUpcomingBookings(prefix: string): Promise<UpcomingBooking[]> {
  const db = getDb();
  const now = new Date();
  const prefixes = stationLookupPrefixes(prefix);
  const rows = await db
    .select({
      callsign: bookings.callsign,
      facilityType: bookings.facilityType,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      type: bookings.type,
    })
    .from(bookings)
    .where(and(inArray(bookings.stationPrefix, prefixes), gte(bookings.endsAt, now)))
    .orderBy(asc(bookings.startsAt));
  return rows.map((row) => ({ ...row, facilityType: row.facilityType as FacilityType }));
}

export function bookingsToIntervals(prefix: string, rows: UpcomingBooking[]): BookingInterval[] {
  return rows.map((row) => ({
    stationPrefix: prefix,
    facilityType: row.facilityType,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  }));
}

export interface StationHourlyStats {
  byFacility: Map<FacilityType, HourlyStat[]>;
}

export interface StationCoverage {
  liveSessionCount: number;
  daysWithData: number;
  weeksWithData: number;
  collectingSince: Date | null;
}

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** How much live VATSIM session history we have for a station. */
export async function getStationCoverage(prefix: string): Promise<StationCoverage> {
  const db = getDb();
  const prefixes = stationLookupPrefixes(prefix);
  const rows = await db
    .select({
      liveSessionCount: sql<number>`count(*)::int`,
      daysWithData: sql<number>`count(distinct date_trunc('day', ${sessions.startedAt}))::int`,
      weeksWithData: sql<number>`count(distinct date_trunc('week', ${sessions.startedAt}))::int`,
      collectingSince: sql<string | Date | null>`min(${sessions.startedAt})`,
    })
    .from(sessions)
    .where(and(inArray(sessions.stationPrefix, prefixes), eq(sessions.source, "live")));

  const row = rows[0];
  return {
    liveSessionCount: Number(row?.liveSessionCount ?? 0),
    daysWithData: Number(row?.daysWithData ?? 0),
    weeksWithData: Number(row?.weeksWithData ?? 0),
    collectingSince: asDate(row?.collectingSince),
  };
}

/** Compute hour-of-week probabilities from live collector sessions only. */
export async function getHourlyStats(prefix: string): Promise<StationHourlyStats> {
  const db = getDb();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_WEEKS * WEEK_MS);
  const prefixes = stationLookupPrefixes(prefix);

  const rows = await db
    .select({
      stationPrefix: sessions.stationPrefix,
      facilityType: sessions.facilityType,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(
      and(
        inArray(sessions.stationPrefix, prefixes),
        eq(sessions.source, "live"),
        or(gte(sessions.startedAt, since), isNull(sessions.endedAt)),
      ),
    );

  const computed = computeHourlyStats(
    rows.map((row) => ({
      // Normalize aliased prefixes so KJAX/JAX sessions coalesce into one group.
      stationPrefix: prefix,
      facilityType: row.facilityType as FacilityType,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    })),
    now,
  );

  const byFacility = new Map<FacilityType, HourlyStat[]>();
  for (const group of computed) {
    if (group.stationPrefix !== prefix) continue;
    const buckets = Array.from({ length: HOURS_PER_WEEK }, (_, i) => ({
      hourOfWeek: i,
      probability: 0,
      sampleWeeks: 0,
      lowConfidence: true,
    }));
    for (const bucket of group.buckets) {
      if (bucket.hourOfWeek >= 0 && bucket.hourOfWeek < HOURS_PER_WEEK) {
        buckets[bucket.hourOfWeek] = bucket;
      }
    }
    byFacility.set(group.facilityType, buckets);
  }

  return { byFacility };
}

export async function getFacilityHeatmap(
  prefix: string,
  facility: FacilityType,
): Promise<HourlyStat[] | null> {
  const stats = await getHourlyStats(prefix);
  return stats.byFacility.get(facility) ?? null;
}

export interface RegionCount {
  region: string;
  online: number;
}

/** Count currently-online positions grouped by region for the home page strip. */
export async function getRegionSummary(): Promise<RegionCount[]> {
  try {
    return await fetchLiveRegionSummary();
  } catch {
    /* DB fallback below */
  }

  const db = getDb();
  const rows = await db
    .select({ prefix: sessions.stationPrefix, count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(isNull(sessions.endedAt))
    .groupBy(sessions.stationPrefix);

  const totals = new Map<string, number>();
  for (const row of rows) {
    const region = regionForPrefix(row.prefix);
    totals.set(region, (totals.get(region) ?? 0) + Number(row.count));
  }
  return [...totals.entries()]
    .map(([region, online]) => ({ region, online }))
    .sort((a, b) => b.online - a.online);
}

export async function getTotalOnline(): Promise<number> {
  try {
    return await fetchLiveTotalOnline();
  } catch {
    /* DB fallback below */
  }

  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(isNull(sessions.endedAt));
  return Number(rows[0]?.count ?? 0);
}
