"use client";

import {
  predictAt,
  type BookingInterval,
  type FacilityType,
  type HourlyStat,
} from "@vatsim-atc/core/client";
import { formatPercent, formatUtcDateTime } from "@/lib/format";
import { probabilityTextClass } from "@/lib/facilities";

const HOUR_MS = 60 * 60 * 1000;

export function ForecastList({
  facilities,
  stats,
  bookingIntervals,
  prefix,
  now,
  hours = 12,
}: {
  facilities: FacilityType[];
  stats: Partial<Record<FacilityType, HourlyStat[]>>;
  bookingIntervals: BookingInterval[];
  prefix: string;
  now: Date;
  hours?: number;
}) {
  const start = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const rows = Array.from({ length: hours }, (_, i) => new Date(start + i * HOUR_MS));
  const currentHour = start;

  return (
    <div className="panel-inset overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 sm:px-4">
              Hour (UTC)
            </th>
            {facilities.map((f) => (
              <th
                key={f}
                className="px-3 py-2.5 text-right font-mono text-[11px] font-semibold text-zinc-500 sm:px-4"
              >
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((at) => {
            const isCurrent = at.getTime() === currentHour;
            return (
              <tr
                key={at.toISOString()}
                className={`border-b border-zinc-200/70 last:border-0 dark:border-zinc-800/40 ${
                  isCurrent
                    ? "bg-accent/5 dark:bg-accent/10"
                    : "odd:bg-zinc-50/70 dark:odd:bg-zinc-950/25"
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 font-mono text-xs sm:px-4 sm:text-sm ${
                    isCurrent
                      ? "font-medium text-zinc-800 dark:text-zinc-200"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {isCurrent && (
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
                  )}
                  {formatUtcDateTime(at)}
                </td>
                {facilities.map((facility) => {
                  const result = predictAt(
                    stats[facility],
                    bookingIntervals,
                    prefix,
                    facility,
                    at,
                  );
                  const isBooking = result.source === "booking";
                  return (
                    <td
                      key={facility}
                      className={`px-3 py-2 text-right font-medium tabular-nums sm:px-4 ${probabilityTextClass(
                        result.probability,
                        isBooking,
                      )}`}
                    >
                      {formatPercent(result.probability)}
                      {isBooking && (
                        <span className="ml-1 text-[10px] text-accent-soft/80">●</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
