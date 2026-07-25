import { corsPreflight, enforceRateLimit, errorResponse, jsonResponse } from "@/lib/api";
import { searchStations } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function GET(request: Request): Promise<Response> {
  const limit = enforceRateLimit(request);
  if (!limit.ok) return limit.response;

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.trim().length === 0) {
    return jsonResponse({ stations: [] }, { sMaxAge: 60, rateLimit: limit });
  }

  try {
    const stations = await searchStations(query);
    return jsonResponse({ stations }, { sMaxAge: 60, rateLimit: limit });
  } catch {
    return errorResponse("Failed to search stations", 500);
  }
}
