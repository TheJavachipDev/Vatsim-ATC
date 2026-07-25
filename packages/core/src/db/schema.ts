import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cid: integer("cid").notNull(),
    callsign: text("callsign").notNull(),
    stationPrefix: text("station_prefix").notNull(),
    infix: text("infix"),
    facilityType: text("facility_type").notNull(),
    frequency: text("frequency"),
    rating: integer("rating"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("live"),
    externalId: text("external_id"),
  },
  (table) => ({
    externalIdIdx: uniqueIndex("sessions_external_id_idx")
      .on(table.externalId)
      .where(sql`external_id IS NOT NULL`),
    stationIdx: index("sessions_station_prefix_idx").on(table.stationPrefix),
    facilityIdx: index("sessions_facility_type_idx").on(table.facilityType),
    stationFacilityStartedIdx: index("sessions_station_facility_started_idx").on(
      table.stationPrefix,
      table.facilityType,
      table.startedAt,
    ),
    openIdx: index("sessions_open_idx").on(table.endedAt),
  }),
);

export const bookings = pgTable(
  "bookings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vatsimBookingId: integer("vatsim_booking_id").notNull(),
    callsign: text("callsign").notNull(),
    stationPrefix: text("station_prefix").notNull(),
    facilityType: text("facility_type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    type: text("type"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    vatsimIdIdx: uniqueIndex("bookings_vatsim_booking_id_idx").on(table.vatsimBookingId),
    stationFacilityIdx: index("bookings_station_facility_idx").on(
      table.stationPrefix,
      table.facilityType,
    ),
    windowIdx: index("bookings_window_idx").on(table.startsAt, table.endsAt),
  }),
);

export const backfillState = pgTable("backfill_state", {
  id: integer("id").primaryKey().default(1),
  offset: integer("offset").notNull().default(0),
  oldestStartSeen: timestamp("oldest_start_seen", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const stations = pgTable("stations", {
  prefix: text("prefix").primaryKey(),
  name: text("name"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const stationHourlyStats = pgTable(
  "station_hourly_stats",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    stationPrefix: text("station_prefix").notNull(),
    facilityType: text("facility_type").notNull(),
    hourOfWeek: smallint("hour_of_week").notNull(),
    probability: real("probability").notNull(),
    sampleWeeks: integer("sample_weeks").notNull(),
    lowConfidence: boolean("low_confidence").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    uniqueBucketIdx: uniqueIndex("station_hourly_stats_bucket_idx").on(
      table.stationPrefix,
      table.facilityType,
      table.hourOfWeek,
    ),
  }),
);

export type BackfillStateRow = typeof backfillState.$inferSelect;
export type NewBackfillStateRow = typeof backfillState.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
export type StationRow = typeof stations.$inferSelect;
export type StationHourlyStatRow = typeof stationHourlyStats.$inferSelect;
export type NewStationHourlyStatRow = typeof stationHourlyStats.$inferInsert;
