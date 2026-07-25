import { displayProbability } from "@vatsim-atc/core";
import { corsPreflight, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/api";
import { buildForecast, loadStationView } from "@/lib/station-view";

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

  try {
    const view = await loadStationView(prefix);
    if (!view) {
      return errorResponse(`Invalid station prefix '${prefix}'`, 404);
    }

    const forecast = buildForecast(view, new Date(), 12);

    return jsonResponse(
      {
        station: view.station,
        online: view.online.map((s) => ({
          cid: s.cid,
          callsign: s.callsign,
          facilityType: s.facilityType,
          infix: s.infix,
          frequency: s.frequency,
          since: s.startedAt.toISOString(),
        })),
        bookings: view.bookings.map((b) => ({
          callsign: b.callsign,
          facilityType: b.facilityType,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          type: b.type,
        })),
        forecast: forecast.map((f) => ({
          facilityType: f.facilityType,
          hours: f.hours.map((h) => ({
            at: h.at.toISOString(),
            probability: Number(displayProbability(h.result.probability).toFixed(4)),
            confidence: h.result.confidence,
            source: h.result.source,
          })),
        })),
      },
      { sMaxAge: 30, rateLimit: limit },
    );
  } catch {
    return errorResponse("Failed to load station", 500);
  }
}
