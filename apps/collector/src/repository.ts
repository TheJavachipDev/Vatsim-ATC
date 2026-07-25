import {
  DEDUPE_WINDOW_MS,
  dbSchema,
  type BackfillProgress,
  type Database,
  type FacilityType,
  type SessionInterval,
  type StationFacilityStats,
  type TrackedSession,
  type ClosedAction,
  type OpenedAction,
  type UpdatedAction,
} from "@vatsim-atc/core";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

const { sessions, bookings, stations, stationHourlyStats, backfillState } = dbSchema;

/** Load every still-open session so the tracker can be rehydrated on startup. */
export async function loadOpenSessions(db: Database): Promise<TrackedSession[]> {
  const rows = await db.select().from(sessions).where(isNull(sessions.endedAt));
  return rows.map((row) => ({
    cid: row.cid,
    callsign: row.callsign,
    stationPrefix: row.stationPrefix,
    infix: row.infix,
    facilityType: row.facilityType as FacilityType,
    frequency: row.frequency,
    rating: row.rating,
    startedAt: row.startedAt,
    lastSeenAt: row.lastSeenAt,
  }));
}

export async function insertOpenedSessions(
  db: Database,
  opened: OpenedAction[],
): Promise<void> {
  if (opened.length === 0) return;
  await db.insert(sessions).values(
    opened.map(({ session }) => ({
      cid: session.cid,
      callsign: session.callsign,
      stationPrefix: session.stationPrefix,
      infix: session.infix,
      facilityType: session.facilityType,
      frequency: session.frequency,
      rating: session.rating,
      startedAt: session.startedAt,
      endedAt: null,
      lastSeenAt: session.lastSeenAt,
      source: "live",
    })),
  );
}

/** Bulk-update last_seen_at for all still-open sessions matching the seen keys. */
export async function touchSessions(
  db: Database,
  updated: UpdatedAction[],
  now: Date,
): Promise<void> {
  if (updated.length === 0) return;
  const tuples = sql.join(
    updated.map((u) => sql`(${u.cid}, ${u.callsign})`),
    sql`, `,
  );
  await db.execute(
    sql`UPDATE ${sessions} SET last_seen_at = ${now}
        WHERE ${sessions.endedAt} IS NULL
        AND (${sessions.cid}, ${sessions.callsign}) IN (${tuples})`,
  );
}

export async function closeSessions(db: Database, closed: ClosedAction[]): Promise<void> {
  for (const action of closed) {
    await db
      .update(sessions)
      .set({ endedAt: action.endedAt })
      .where(
        and(
          isNull(sessions.endedAt),
          sql`${sessions.cid} = ${action.cid}`,
          sql`${sessions.callsign} = ${action.callsign}`,
        ),
      );
  }
}

/** Lazily register/refresh a station in the registry. */
export async function upsertStations(
  db: Database,
  prefixes: Iterable<string>,
  now: Date,
): Promise<void> {
  const values = [...new Set(prefixes)].map((prefix) => ({
    prefix,
    name: null,
    firstSeenAt: now,
    lastSeenAt: now,
  }));
  if (values.length === 0) return;
  await db
    .insert(stations)
    .values(values)
    .onConflictDoUpdate({
      target: stations.prefix,
      set: { lastSeenAt: now },
    });
}

export interface BookingUpsert {
  vatsimBookingId: number;
  callsign: string;
  stationPrefix: string;
  facilityType: FacilityType;
  startsAt: Date;
  endsAt: Date;
  type: string | null;
}

export async function upsertBookings(
  db: Database,
  rows: BookingUpsert[],
  fetchedAt: Date,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(bookings)
    .values(rows.map((row) => ({ ...row, fetchedAt })))
    .onConflictDoUpdate({
      target: bookings.vatsimBookingId,
      set: {
        callsign: sql`excluded.callsign`,
        stationPrefix: sql`excluded.station_prefix`,
        facilityType: sql`excluded.facility_type`,
        startsAt: sql`excluded.starts_at`,
        endsAt: sql`excluded.ends_at`,
        type: sql`excluded.type`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** Remove bookings that have fully elapsed to keep the table lean. */
export async function pruneExpiredBookings(db: Database, before: Date): Promise<void> {
  await db.delete(bookings).where(sql`${bookings.endsAt} < ${before}`);
}

/** Load sessions relevant to the rolling prediction window. */
export async function loadRecentSessions(
  db: Database,
  since: Date,
): Promise<SessionInterval[]> {
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
        eq(sessions.source, "live"),
        or(gte(sessions.startedAt, since), isNull(sessions.endedAt)),
      ),
    );
  return rows.map((row) => ({
    stationPrefix: row.stationPrefix,
    facilityType: row.facilityType as FacilityType,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }));
}

/** Replace the materialized hourly stats table with a freshly computed set. */
export async function replaceHourlyStats(
  db: Database,
  computed: StationFacilityStats[],
  computedAt: Date,
): Promise<number> {
  const values = computed.flatMap((group) =>
    group.buckets.map((bucket) => ({
      stationPrefix: group.stationPrefix,
      facilityType: group.facilityType,
      hourOfWeek: bucket.hourOfWeek,
      probability: bucket.probability,
      sampleWeeks: bucket.sampleWeeks,
      lowConfidence: bucket.lowConfidence,
      computedAt,
    })),
  );

  await db.transaction(async (tx) => {
    await tx.delete(stationHourlyStats);
    const chunkSize = 1000;
    for (let i = 0; i < values.length; i += chunkSize) {
      await tx.insert(stationHourlyStats).values(values.slice(i, i + chunkSize));
    }
  });

  return values.length;
}

export async function loadBackfillState(db: Database): Promise<BackfillProgress | null> {
  const rows = await db.select().from(backfillState).where(sql`${backfillState.id} = 1`);
  const row = rows[0];
  if (!row) return null;
  return {
    offset: row.offset,
    oldestStartSeen: row.oldestStartSeen,
  };
}

export async function saveBackfillState(db: Database, state: BackfillProgress): Promise<void> {
  const now = new Date();
  await db
    .insert(backfillState)
    .values({
      id: 1,
      offset: state.offset,
      oldestStartSeen: state.oldestStartSeen,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: backfillState.id,
      set: {
        offset: sql`excluded.offset`,
        oldestStartSeen: sql`excluded.oldest_start_seen`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export async function clearBackfillState(db: Database): Promise<void> {
  await db.delete(backfillState).where(sql`${backfillState.id} = 1`);
}

export async function findDedupeCandidates(
  db: Database,
  cid: number,
  callsign: string,
  startedAt: Date,
  windowMs = DEDUPE_WINDOW_MS,
): Promise<{ cid: number; callsign: string; startedAt: Date }[]> {
  const windowStart = new Date(startedAt.getTime() - windowMs);
  const windowEnd = new Date(startedAt.getTime() + windowMs);
  return db
    .select({
      cid: sessions.cid,
      callsign: sessions.callsign,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(
      and(
        sql`${sessions.cid} = ${cid}`,
        sql`upper(${sessions.callsign}) = ${callsign.trim().toUpperCase()}`,
        gte(sessions.startedAt, windowStart),
        lte(sessions.startedAt, windowEnd),
      ),
    );
}

export interface BackfillSessionRow {
  externalId: string;
  cid: number;
  callsign: string;
  stationPrefix: string;
  infix: string | null;
  facilityType: FacilityType;
  rating: number | null;
  startedAt: Date;
  endedAt: Date;
}

export async function upsertBackfillSessions(
  db: Database,
  rows: BackfillSessionRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = sql.join(
      chunk.map(
        (row) =>
          sql`(${row.externalId}, 'backfill', ${row.cid}, ${row.callsign}, ${row.stationPrefix}, ${row.infix}, ${row.facilityType}, ${null}, ${row.rating}, ${row.startedAt}, ${row.endedAt}, ${row.endedAt})`,
      ),
      sql`, `,
    );

    await db.execute(sql`
      INSERT INTO ${sessions} (
        external_id, source, cid, callsign, station_prefix, infix, facility_type,
        frequency, rating, started_at, ended_at, last_seen_at
      )
      VALUES ${values}
      ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE SET
        ended_at = EXCLUDED.ended_at,
        rating = EXCLUDED.rating,
        last_seen_at = EXCLUDED.last_seen_at
    `);
  }
}

export async function countBackfillSessionsByFacility(
  db: Database,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      facilityType: sessions.facilityType,
      count: sql<number>`count(*)::int`,
    })
    .from(sessions)
    .where(sql`${sessions.source} = 'backfill'`)
    .groupBy(sessions.facilityType);

  return new Map(rows.map((row) => [row.facilityType, row.count]));
}

export async function deleteBackfillSessions(db: Database): Promise<void> {
  await db.delete(sessions).where(sql`${sessions.source} = 'backfill'`);
}

export async function countBackfillSessions(db: Database): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(sql`${sessions.source} = 'backfill'`);
  return rows[0]?.count ?? 0;
}
