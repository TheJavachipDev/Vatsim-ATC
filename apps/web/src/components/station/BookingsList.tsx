"use client";

import type { DashboardBooking } from "@/lib/dashboard-types";
import { formatUtcDateTime } from "@/lib/format";

export function BookingsList({ bookings }: { bookings: DashboardBooking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="empty-state py-10">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No confirmed bookings for this station.
        </p>
        <p className="max-w-[16rem] text-xs leading-relaxed text-zinc-500">
          Booked sessions from the VATSIM calendar will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="panel-inset divide-y divide-zinc-200/80 dark:divide-zinc-800/60">
      {bookings.map((b, i) => (
        <li
          key={`${b.callsign}-${b.startsAt}-${i}`}
          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
        >
          <div className="min-w-0">
            <div className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {b.callsign}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {formatUtcDateTime(new Date(b.startsAt))}
              <span className="mx-1.5 text-zinc-400 dark:text-zinc-600">→</span>
              {formatUtcDateTime(new Date(b.endsAt))}
            </div>
          </div>
          {b.type && b.type !== "booking" && (
            <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-soft">
              {b.type}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
