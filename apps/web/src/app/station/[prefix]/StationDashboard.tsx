"use client";

import type { FacilityType, HourlyStat } from "@vatsim-atc/core/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingsList } from "@/components/station/BookingsList";
import { ForecastList } from "@/components/station/ForecastList";
import { HeatmapGrid } from "@/components/station/HeatmapGrid";
import { LiveStatusBadges } from "@/components/station/LiveStatusBadges";
import { ProbabilityCards } from "@/components/station/ProbabilityCards";
import {
  TimeWindowSelector,
  nextHours,
  type TimeWindow,
} from "@/components/station/TimeWindowSelector";
import {
  bookingIntervals,
  type DashboardBooking,
  type DashboardData,
  type DashboardOnline,
} from "@/lib/dashboard-types";
import { isControlFacility } from "@/lib/airport-search";
import { PRIMARY_FACILITY_TYPES } from "@vatsim-atc/core/client";

const LIVE_REFRESH_MS = 30_000;

function Section({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="mb-4 sm:mb-5">
        <h2 className="section-label">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function facilitiesToShow(
  prefix: string,
  online: DashboardOnline[],
  bookings: DashboardBooking[],
  stats: Partial<Record<FacilityType, HourlyStat[]>>,
): FacilityType[] {
  const present = new Set<FacilityType>();
  for (const s of online) present.add(s.facilityType);
  for (const b of bookings) present.add(b.facilityType);
  for (const f of Object.keys(stats) as FacilityType[]) present.add(f);

  const ordered: FacilityType[] = [];
  for (const f of PRIMARY_FACILITY_TYPES) {
    if (present.has(f)) ordered.push(f);
  }
  for (const f of present) {
    if (!ordered.includes(f)) ordered.push(f);
  }
  if (ordered.length === 0) {
    return isControlFacility(prefix) ? ["CTR", "FSS"] : ["GND", "TWR", "APP", "CTR"];
  }
  return ordered;
}

export function StationDashboard({ data: initial }: { data: DashboardData }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [window, setWindow] = useState<TimeWindow | null>(null);
  const [online, setOnline] = useState(initial.online);
  const [bookings, setBookings] = useState(initial.bookings);
  const [knownPositions] = useState(initial.knownPositions);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const current = new Date();
    setNow(current);
    setWindow(nextHours(current, 2));
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/station/${encodeURIComponent(initial.station.prefix)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        online: DashboardOnline[];
        bookings: DashboardBooking[];
      };
      setOnline(json.online);
      setBookings(json.bookings);
      setLiveUpdatedAt(new Date());
    } catch {
      /* ignore transient network errors */
    }
  }, [initial.station.prefix]);

  // Poll the public API so live status stays in sync with VATSIM.
  useEffect(() => {
    void refreshLive();
    const timer = setInterval(() => void refreshLive(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshLive]);

  const data: DashboardData = useMemo(
    () => ({ ...initial, online, bookings }),
    [initial, online, bookings],
  );

  const intervals = useMemo(() => bookingIntervals(data), [data]);

  const facilities = useMemo(
    () => facilitiesToShow(initial.station.prefix, online, bookings, initial.stats),
    [online, bookings, initial.stats, initial.station.prefix],
  );

  const facilityStats = useMemo(
    () =>
      (Object.entries(initial.stats) as [FacilityType, HourlyStat[]][])
        .filter(([, buckets]) => buckets.length > 0)
        .map(([facility, buckets]) => ({ facility, buckets })),
    [initial.stats],
  );

  const hasHistoricalData = facilityStats.length > 0;
  const { weeksWithData, daysWithData } = initial.coverage;

  useEffect(() => {
    if (hasHistoricalData && weeksWithData >= 4) return;
    const timer = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(timer);
  }, [hasHistoricalData, weeksWithData, router]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="panel">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-accent dark:text-zinc-400 dark:hover:text-accent-soft"
            >
              <span aria-hidden>←</span> Search another station
            </Link>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <h1 className="font-mono text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
                {data.station.prefix}
              </h1>
              {data.station.iata && data.station.iata !== data.station.prefix && (
                <span className="rounded-md border border-zinc-200 bg-zinc-100/80 px-2 py-0.5 font-mono text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                  {data.station.iata}
                </span>
              )}
              {data.station.faa &&
                data.station.faa !== data.station.prefix &&
                data.station.faa !== data.station.iata && (
                  <span className="rounded-md border border-zinc-200 bg-zinc-100/80 px-2 py-0.5 font-mono text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                    FAA {data.station.faa}
                  </span>
                )}
              {data.station.name && (
                <span className="text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
                  {data.station.name}
                </span>
              )}
            </div>
            <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Live status from VATSIM. Coverage forecasts are based on when controllers have been
              online here before.
            </p>
            {daysWithData === 0 && (
              <p className="mt-2 max-w-xl rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200/90">
                No staffing history for this station yet — forecasts will appear once controllers
                have been online here.
              </p>
            )}
            {liveUpdatedAt && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                Live status updated {liveUpdatedAt.toLocaleTimeString()} · refreshes every 30s
              </p>
            )}
          </div>
          <div className="flex gap-3 text-center text-sm">
            <div className={`stat-tile ${online.length > 0 ? "stat-tile-live" : ""}`}>
              <div
                className={`text-2xl font-semibold tabular-nums tracking-tight ${
                  online.length > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {online.length}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                online now
              </div>
            </div>
            <div className={`stat-tile ${bookings.length > 0 ? "border-accent/35 bg-accent/10 dark:border-accent/30" : ""}`}>
              <div
                className={`text-2xl font-semibold tabular-nums tracking-tight ${
                  bookings.length > 0
                    ? "text-amber-700 dark:text-accent-soft"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {bookings.length}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                upcoming
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/60">
          {now ? (
            <LiveStatusBadges
              stationPrefix={data.station.prefix}
              online={online}
              bookings={bookings}
              knownPositions={knownPositions}
              now={now}
            />
          ) : (
            <div className="h-16 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-800/40" />
          )}
        </div>
      </div>

      <Section
        title="Coverage forecast"
        description="Chance that each position will be staffed during your selected time window."
      >
        {now && window ? (
          <div className="space-y-4">
            <TimeWindowSelector now={now} value={window} onChange={setWindow} />
            <ProbabilityCards
              facilities={facilities}
              stats={initial.stats}
              bookingIntervals={intervals}
              prefix={data.station.prefix}
              start={window.start}
              end={window.end}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-800/40" />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Weekly pattern"
        description="When this station is usually staffed — brighter green means higher historical coverage."
      >
        <HeatmapGrid facilityStats={facilityStats} />
      </Section>

      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-2">
        <Section
          title="Hour-by-hour"
          description="Coverage probability for each of the next 12 hours."
        >
          {now ? (
            <ForecastList
              facilities={facilities}
              stats={initial.stats}
              bookingIntervals={intervals}
              prefix={data.station.prefix}
              now={now}
            />
          ) : (
            <div className="h-48 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-800/40" />
          )}
        </Section>
        <Section title="Confirmed bookings" description="Scheduled sessions from the VATSIM calendar.">
          <BookingsList bookings={bookings} />
        </Section>
      </div>
    </div>
  );
}
