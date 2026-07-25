ALTER TABLE "sessions" ADD COLUMN "source" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_external_id_idx" ON "sessions" USING btree ("external_id") WHERE "external_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backfill_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"offset" integer DEFAULT 0 NOT NULL,
	"oldest_start_seen" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
