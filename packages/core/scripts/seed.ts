import "./load-env.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { computeHourlyStats } from "../src/prediction.js";
import { generateSeedSessions } from "../src/seed-sessions.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main(): Promise<void> {
  const { db, pool } = createDb(connectionString!);
  const now = new Date();
  const { sessions, intervals, stations } = generateSeedSessions({ weeks: 8, now });

  console.log("Clearing existing data...");
  await db.delete(schema.stationHourlyStats);
  await db.delete(schema.sessions);
  await db.delete(schema.bookings);
  await db.delete(schema.stations);
  await db.delete(schema.backfillState);

  const sessionRows = sessions.map((session) => ({
    cid: session.cid,
    callsign: session.callsign,
    stationPrefix: session.stationPrefix,
    infix: session.infix,
    facilityType: session.facilityType,
    frequency: null,
    rating: session.rating,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastSeenAt: session.endedAt,
    source: "live",
  }));

  console.log(`Inserting ${stations.length} stations and ${sessionRows.length} sessions...`);
  await db.insert(schema.stations).values(
    stations.map((station) => ({
      prefix: station.prefix,
      name: station.name,
      firstSeenAt: new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000),
      lastSeenAt: now,
    })),
  );

  for (let i = 0; i < sessionRows.length; i += 1000) {
    await db.insert(schema.sessions).values(sessionRows.slice(i, i + 1000));
  }

  const HOUR_MS = 60 * 60 * 1000;
  const bookingRows: (typeof schema.bookings.$inferInsert)[] = [
    ["EGKK", "TWR", 1],
    ["EGKK", "APP", 1],
    ["EDDF", "TWR", 2],
    ["EHAM", "GND", 2],
  ].map(([prefix, facility, dayOffset], index) => {
    const start = new Date(
      Math.floor(now.getTime() / (24 * HOUR_MS)) * 24 * HOUR_MS + Number(dayOffset) * 24 * HOUR_MS + 18 * HOUR_MS,
    );
    return {
      vatsimBookingId: 900000 + index,
      callsign: `${prefix}_${facility}`,
      stationPrefix: String(prefix),
      facilityType: String(facility),
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR_MS),
      type: "booking",
      fetchedAt: now,
    };
  });
  await db.insert(schema.bookings).values(bookingRows);

  console.log("Computing hourly stats...");
  const computed = computeHourlyStats(intervals, now);
  const statRows = computed.flatMap((group) =>
    group.buckets.map((bucket) => ({
      stationPrefix: group.stationPrefix,
      facilityType: group.facilityType,
      hourOfWeek: bucket.hourOfWeek,
      probability: bucket.probability,
      sampleWeeks: bucket.sampleWeeks,
      lowConfidence: bucket.lowConfidence,
      computedAt: now,
    })),
  );
  for (let i = 0; i < statRows.length; i += 1000) {
    await db.insert(schema.stationHourlyStats).values(statRows.slice(i, i + 1000));
  }

  console.log(`Seed complete: ${sessionRows.length} sessions, ${statRows.length} stat rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
