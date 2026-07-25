import type { BookingInterval, FacilityType, HourlyStat, PositionRef } from "@vatsim-atc/core";

export interface DashboardOnline {
  cid: number;
  callsign: string;
  facilityType: FacilityType;
  infix: string | null;
  frequency: string | null;
  since: string;
}

export interface DashboardBooking {
  callsign: string;
  facilityType: FacilityType;
  startsAt: string;
  endsAt: string;
  type: string | null;
}

export interface DashboardData {
  station: { prefix: string; name: string | null; iata?: string | null; faa?: string | null };
  coverage: {
    liveSessionCount: number;
    daysWithData: number;
    weeksWithData: number;
    collectingSince: string | null;
  };
  facilities: FacilityType[];
  knownPositions: PositionRef[];
  online: DashboardOnline[];
  bookings: DashboardBooking[];
  /** Facility -> 168 hour-of-week buckets. Only facilities with history appear. */
  stats: Partial<Record<FacilityType, HourlyStat[]>>;
}

export function bookingIntervals(data: DashboardData): BookingInterval[] {
  return data.bookings.map((b) => ({
    stationPrefix: data.station.prefix,
    facilityType: b.facilityType,
    startsAt: new Date(b.startsAt),
    endsAt: new Date(b.endsAt),
  }));
}
