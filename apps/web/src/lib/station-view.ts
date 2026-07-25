import {
  PRIMARY_FACILITY_TYPES,
  predictAt,
  type BookingInterval,
  type FacilityType,
  type HourlyStat,
  type PositionRef,
  type PredictionResult,
} from "@vatsim-atc/core";
import { isControlFacility, resolveStationPrefix } from "./airport-search";
import {
  bookingsToIntervals,
  getHourlyStats,
  getKnownPositionRefs,
  getOpenSessions,
  getStation,
  getStationCoverage,
  getUpcomingBookings,
  type OpenSession,
  type StationCoverage,
  type StationSummary,
  type UpcomingBooking,
} from "./queries";
import { registerStation } from "./register-station";
import { isValidStationPrefix } from "./station-prefix";

const HOUR_MS = 60 * 60 * 1000;

export interface ForecastHour {
  at: Date;
  result: PredictionResult;
}

export interface FacilityForecast {
  facilityType: FacilityType;
  hours: ForecastHour[];
}

export interface StationView {
  station: StationSummary;
  coverage: StationCoverage;
  online: OpenSession[];
  bookings: UpcomingBooking[];
  knownPositions: PositionRef[];
  statsByFacility: Map<FacilityType, HourlyStat[]>;
  bookingIntervals: BookingInterval[];
  /** Facilities to surface: primary set plus anything with data. */
  facilities: FacilityType[];
}

const DEFAULT_AIRPORT_FACILITIES: FacilityType[] = ["GND", "TWR", "APP", "CTR"];
const DEFAULT_CONTROL_FACILITIES: FacilityType[] = ["CTR", "FSS"];

export { isValidStationPrefix } from "./station-prefix";

function defaultFacilitiesFor(prefix: string): FacilityType[] {
  return isControlFacility(prefix)
    ? [...DEFAULT_CONTROL_FACILITIES]
    : [...DEFAULT_AIRPORT_FACILITIES];
}

function facilitiesToShow(
  prefix: string,
  online: OpenSession[],
  bookings: UpcomingBooking[],
  statsByFacility: Map<FacilityType, HourlyStat[]>,
): FacilityType[] {
  const present = new Set<FacilityType>();
  for (const s of online) present.add(s.facilityType);
  for (const b of bookings) present.add(b.facilityType);
  for (const f of statsByFacility.keys()) present.add(f);

  const ordered: FacilityType[] = [];
  for (const f of PRIMARY_FACILITY_TYPES) {
    if (present.has(f)) ordered.push(f);
  }
  for (const f of present) {
    if (!ordered.includes(f)) ordered.push(f);
  }
  if (ordered.length === 0) return defaultFacilitiesFor(prefix);
  return ordered;
}

export async function loadStationView(prefix: string): Promise<StationView | null> {
  const normalized = resolveStationPrefix(prefix);
  if (!isValidStationPrefix(normalized)) return null;

  await registerStation(normalized);

  const [station, online, bookings, knownPositions, stats, coverage] = await Promise.all([
    getStation(normalized),
    getOpenSessions(normalized),
    getUpcomingBookings(normalized),
    getKnownPositionRefs(normalized),
    getHourlyStats(normalized),
    getStationCoverage(normalized),
  ]);

  return {
    station: station ?? { prefix: normalized, name: null },
    coverage,
    online,
    bookings,
    knownPositions,
    statsByFacility: stats.byFacility,
    bookingIntervals: bookingsToIntervals(normalized, bookings),
    facilities: facilitiesToShow(normalized, online, bookings, stats.byFacility),
  };
}

/** Build an hour-by-hour forecast for each facility starting at `from`. */
export function buildForecast(
  view: StationView,
  from: Date,
  hours: number,
): FacilityForecast[] {
  const start = Math.floor(from.getTime() / HOUR_MS) * HOUR_MS;
  return view.facilities.map((facility) => {
    const buckets = view.statsByFacility.get(facility);
    const forecastHours: ForecastHour[] = [];
    for (let i = 0; i < hours; i += 1) {
      const at = new Date(start + i * HOUR_MS);
      forecastHours.push({
        at,
        result: predictAt(buckets, view.bookingIntervals, view.station.prefix, facility, at),
      });
    }
    return { facilityType: facility, hours: forecastHours };
  });
}
