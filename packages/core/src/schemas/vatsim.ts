import { z } from "zod";

/**
 * Boundary schemas for the two external VATSIM feeds. We intentionally validate
 * only the fields we consume and pass through the rest, so upstream additions
 * do not break the collector.
 */

export const VatsimControllerSchema = z.object({
  cid: z.number().int(),
  callsign: z.string(),
  frequency: z.string().nullish(),
  facility: z.number().int(),
  rating: z.number().int().nullish(),
  logon_time: z.string(),
  last_updated: z.string(),
});

export type VatsimController = z.infer<typeof VatsimControllerSchema>;

export const VatsimDatafeedSchema = z.object({
  controllers: z.array(VatsimControllerSchema),
});

export type VatsimDatafeed = z.infer<typeof VatsimDatafeedSchema>;

/**
 * ATC bookings API. Times are `YYYY-MM-DD HH:MM:SS` strings which we treat as
 * UTC. `type` is one of booking/event/exam/mentoring/training; we keep it as a
 * free string so unexpected values don't fail validation.
 */
export const VatsimBookingSchema = z.object({
  id: z.number().int(),
  cid: z.number().int(),
  type: z.string().nullish(),
  callsign: z.string(),
  start: z.string(),
  end: z.string(),
  division: z.string().nullish(),
  subdivision: z.string().nullish(),
});

export type VatsimBooking = z.infer<typeof VatsimBookingSchema>;

export const VatsimBookingsArraySchema = z.array(VatsimBookingSchema);

/** Parse a bookings-API timestamp (`YYYY-MM-DD HH:MM:SS`, UTC) into a Date. */
export function parseBookingTimestamp(value: string): Date {
  const iso = value.trim().replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Date(withZone);
}
