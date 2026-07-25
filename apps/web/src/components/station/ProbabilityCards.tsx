"use client";

import {
  averageProbabilityOverWindow,
  type BookingInterval,
  type FacilityType,
  type HourlyStat,
} from "@vatsim-atc/core/client";
import { formatPercent } from "@/lib/format";
import { displayProbability } from "@vatsim-atc/core/client";
import { facilityLabel, probabilityBarClass, probabilityTextClass } from "@/lib/facilities";

export function ProbabilityCards({
  facilities,
  stats,
  bookingIntervals,
  prefix,
  start,
  end,
}: {
  facilities: FacilityType[];
  stats: Partial<Record<FacilityType, HourlyStat[]>>;
  bookingIntervals: BookingInterval[];
  prefix: string;
  start: Date;
  end: Date;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {facilities.map((facility) => {
        const result = averageProbabilityOverWindow(
          stats[facility],
          bookingIntervals,
          prefix,
          facility,
          start,
          end,
        );
        const isBooking = result.source === "booking";
        const pct = Math.round(displayProbability(result.probability) * 100);
        return (
          <div
            key={facility}
            className="panel-inset group flex flex-col p-3.5 transition duration-150 hover:border-zinc-300/90 dark:hover:border-zinc-700/80 sm:p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg">
                  {facility}
                </span>
                <p className="text-xs text-zinc-500">{facilityLabel(facility)}</p>
              </div>
              {isBooking && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-soft">
                  Booked
                </span>
              )}
            </div>
            <div
              className={`mt-3 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl ${probabilityTextClass(
                result.probability,
                isBooking,
              )}`}
            >
              {formatPercent(result.probability)}
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${probabilityBarClass(
                  result.probability,
                  isBooking,
                )}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
              {result.confidence === "low"
                ? "Still learning — check back soon"
                : `Based on ${result.sampleWeeks} week${result.sampleWeeks === 1 ? "" : "s"} of history`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
