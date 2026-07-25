import type { FacilityType, HourlyStat } from "@vatsim-atc/core";
import { notFound, redirect } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard-types";
import { resolveStationPrefix } from "@/lib/airport-search";
import { loadStationView } from "@/lib/station-view";
import { StationDashboard } from "./StationDashboard";

export const dynamic = "force-dynamic";

export default async function StationPage({
  params,
}: {
  params: Promise<{ prefix: string }>;
}) {
  const { prefix } = await params;
  const requested = prefix.trim().toUpperCase();
  const resolved = resolveStationPrefix(requested);
  if (resolved !== requested) {
    redirect(`/station/${encodeURIComponent(resolved)}`);
  }

  const view = await loadStationView(resolved);
  if (!view) notFound();

  const stats: Partial<Record<FacilityType, HourlyStat[]>> = {};
  for (const [facility, buckets] of view.statsByFacility) {
    stats[facility] = buckets;
  }

  const data: DashboardData = {
    station: {
      prefix: view.station.prefix,
      name: view.station.name,
      iata: view.station.iata ?? null,
      faa: view.station.faa ?? null,
    },
    coverage: {
      liveSessionCount: view.coverage.liveSessionCount,
      daysWithData: view.coverage.daysWithData,
      weeksWithData: view.coverage.weeksWithData,
      collectingSince: view.coverage.collectingSince?.toISOString() ?? null,
    },
    facilities: view.facilities,
    knownPositions: view.knownPositions,
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
    stats,
  };

  return <StationDashboard data={data} />;
}
