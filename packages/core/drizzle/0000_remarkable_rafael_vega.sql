CREATE TABLE IF NOT EXISTS "bookings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vatsim_booking_id" integer NOT NULL,
	"callsign" text NOT NULL,
	"station_prefix" text NOT NULL,
	"facility_type" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"type" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cid" integer NOT NULL,
	"callsign" text NOT NULL,
	"station_prefix" text NOT NULL,
	"infix" text,
	"facility_type" text NOT NULL,
	"frequency" text,
	"rating" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "station_hourly_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"station_prefix" text NOT NULL,
	"facility_type" text NOT NULL,
	"hour_of_week" smallint NOT NULL,
	"probability" real NOT NULL,
	"sample_weeks" integer NOT NULL,
	"low_confidence" boolean NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stations" (
	"prefix" text PRIMARY KEY NOT NULL,
	"name" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_vatsim_booking_id_idx" ON "bookings" USING btree ("vatsim_booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_station_facility_idx" ON "bookings" USING btree ("station_prefix","facility_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_window_idx" ON "bookings" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_station_prefix_idx" ON "sessions" USING btree ("station_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_facility_type_idx" ON "sessions" USING btree ("facility_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_station_facility_started_idx" ON "sessions" USING btree ("station_prefix","facility_type","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_open_idx" ON "sessions" USING btree ("ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "station_hourly_stats_bucket_idx" ON "station_hourly_stats" USING btree ("station_prefix","facility_type","hour_of_week");