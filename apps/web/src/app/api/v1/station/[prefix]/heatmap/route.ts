import { FACILITY_TYPES, displayProbability, type FacilityType } from "@vatsim-atc/core";
import { corsPreflight, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/api";
import { getFacilityHeatmap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ prefix: string }> },
): Promise<Response> {
  const limit = enforceRateLimit(request);
  if (!limit.ok) return limit.response;

  const { prefix } = await params;
  const url = new URL(request.url);
  const facilityParam = (url.searchParams.get("facility") ?? "").toUpperCase();

  if (!FACILITY_TYPES.includes(facilityParam as FacilityType)) {
    return errorResponse(
      `Invalid or missing 'facility'. Expected one of: ${FACILITY_TYPES.join(", ")}`,
      400,
    );
  }
  const facility = facilityParam as FacilityType;

  try {
    const buckets = await getFacilityHeatmap(prefix.trim().toUpperCase(), facility);
    if (!buckets) {
      return errorResponse(
        `No ${facility} history for station '${prefix.toUpperCase()}'`,
        404,
      );
    }
    return jsonResponse(
      {
        station: prefix.trim().toUpperCase(),
        facility,
        buckets: buckets.map((b) => ({
          hourOfWeek: b.hourOfWeek,
          probability: Number(displayProbability(b.probability).toFixed(4)),
          sampleWeeks: b.sampleWeeks,
          lowConfidence: b.lowConfidence,
        })),
      },
      { sMaxAge: 3600, rateLimit: limit },
    );
  } catch {
    return errorResponse("Failed to load heatmap", 500);
  }
}
