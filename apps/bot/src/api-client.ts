import type { FacilityType } from "@vatsim-atc/core";
import { config } from "./config.js";

export interface StationApiResponse {
  station: { prefix: string; name: string | null };
  online: { callsign: string; facilityType: FacilityType; frequency: string | null; since: string }[];
  bookings: {
    callsign: string;
    facilityType: FacilityType;
    startsAt: string;
    endsAt: string;
    type: string | null;
  }[];
  forecast: {
    facilityType: FacilityType;
    hours: { at: string; probability: number; confidence: string; source: string }[];
  }[];
}

/** Fetch a station's live status + forecast from the public web API. */
export async function fetchStation(prefix: string): Promise<StationApiResponse | null> {
  const url = `${config.webApiUrl}/api/v1/station/${encodeURIComponent(prefix.toUpperCase())}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Station API returned ${res.status}`);
  return (await res.json()) as StationApiResponse;
}
