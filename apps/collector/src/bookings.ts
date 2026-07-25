import {
  VatsimBookingsArraySchema,
  parseBookingTimestamp,
  parseCallsign,
  type Database,
} from "@vatsim-atc/core";
import { config } from "./config.js";
import { fetchJson } from "./fetch-json.js";
import { logger } from "./logger.js";
import { pruneExpiredBookings, upsertBookings, type BookingUpsert } from "./repository.js";
import { withRetry } from "./retry.js";

export async function syncBookings(db: Database): Promise<void> {
  let payload: unknown;
  try {
    payload = await withRetry(() => fetchJson(config.bookingsUrl, config.fetchTimeoutMs), {
      retries: 2,
      baseDelayMs: 1000,
    });
  } catch (err) {
    logger.error({ err }, "bookings fetch failed; skipping cycle");
    return;
  }

  const parsed = VatsimBookingsArraySchema.safeParse(payload);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues.slice(0, 5) }, "bookings validation failed");
    return;
  }

  const now = new Date();
  const rows: BookingUpsert[] = [];
  for (const booking of parsed.data) {
    const startsAt = parseBookingTimestamp(booking.start);
    const endsAt = parseBookingTimestamp(booking.end);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    if (endsAt <= now) continue; // only keep current/upcoming
    const parsedCallsign = parseCallsign(booking.callsign);
    rows.push({
      vatsimBookingId: booking.id,
      callsign: parsedCallsign.callsign,
      stationPrefix: parsedCallsign.stationPrefix,
      facilityType: parsedCallsign.facilityType,
      startsAt,
      endsAt,
      type: booking.type ?? null,
    });
  }

  await upsertBookings(db, rows, now);
  await pruneExpiredBookings(db, now);
  logger.info({ upserted: rows.length }, "bookings sync complete");
}
