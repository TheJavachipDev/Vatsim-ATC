import { FACILITY_TYPES, displayProbability, predictAt, type FacilityType } from "@vatsim-atc/core";
import { corsPreflight, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/api";
import { bookingsToIntervals, getFacilityHeatmap, getUpcomingBookings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function GET(request: Request): Promise<Response> {
  const limit = enforceRateLimit(request);
  if (!limit.ok) return limit.response;

  const url = new URL(request.url);
  const station = (url.searchParams.get("station") ?? "").trim().toUpperCase();
  const facilityParam = (url.searchParams.get("facility") ?? "").toUpperCase();
  const atParam = url.searchParams.get("at");

  if (station.length === 0) {
    return errorResponse("Missing required 'station' parameter", 400);
  }
  if (!FACILITY_TYPES.includes(facilityParam as FacilityType)) {
    return errorResponse(
      `Invalid or missing 'facility'. Expected one of: ${FACILITY_TYPES.join(", ")}`,
      400,
    );
  }
  const at = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(at.getTime())) {
    return errorResponse("Invalid 'at' timestamp; expected ISO 8601", 400);
  }
  const facility = facilityParam as FacilityType;

  try {
    const [buckets, bookings] = await Promise.all([
      getFacilityHeatmap(station, facility),
      getUpcomingBookings(station),
    ]);
    const result = predictAt(
      buckets ?? undefined,
      bookingsToIntervals(station, bookings),
      station,
      facility,
      at,
    );
    return jsonResponse(
      {
        station,
        facility,
        at: at.toISOString(),
        probability: Number(displayProbability(result.probability).toFixed(4)),
        confidence: result.confidence,
        source: result.source,
        sampleWeeks: result.sampleWeeks,
      },
      { sMaxAge: 3600, rateLimit: limit },
    );
  } catch {
    return errorResponse("Failed to compute prediction", 500);
  }
}
