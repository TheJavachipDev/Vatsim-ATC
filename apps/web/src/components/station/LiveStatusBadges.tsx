"use client";

import {
  collectKnownPositionSlots,
  DEFAULT_AIRPORT_FACILITIES,
  DEFAULT_CONTROL_FACILITIES,
  formatPositionSlotLabel,
  positionFromCallsign,
  type PositionRef,
  uncoveredPositionSlots,
} from "@vatsim-atc/core/client";
import type { DashboardBooking, DashboardOnline } from "@/lib/dashboard-types";
import { isControlFacility } from "@/lib/airport-search";
import { facilityLabel } from "@/lib/facilities";

const SOON_MS = 2 * 60 * 60 * 1000;

type Status = "online" | "soon" | "offline";

function bookingSoon(
  slot: PositionRef,
  bookings: DashboardBooking[],
  now: Date,
): boolean {
  return bookings.some((b) => {
    const booked = positionFromCallsign(b.callsign, b.facilityType);
    if (booked.facilityType !== slot.facilityType || booked.infix !== slot.infix) return false;
    const start = new Date(b.startsAt).getTime();
    return start > now.getTime() && start - now.getTime() <= SOON_MS;
  });
}

const DOT: Record<Status, string> = {
  online: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  soon: "bg-accent shadow-[0_0_8px_rgba(245,158,11,0.5)]",
  offline: "bg-zinc-400 dark:bg-zinc-600",
};

const CARD: Record<Status, string> = {
  online: "border-emerald-500/35 bg-emerald-500/8",
  soon: "border-accent/35 bg-accent/8",
  offline: "border-zinc-200/90 bg-zinc-50/70 dark:border-zinc-800/80 dark:bg-zinc-900/35",
};

const STATUS_TEXT: Record<Status, string> = {
  online: "text-emerald-600 dark:text-emerald-400/90",
  soon: "text-amber-700 dark:text-accent-soft/90",
  offline: "text-zinc-500",
};

const LABELS: Record<Status, string> = {
  online: "Online now",
  soon: "Booked soon",
  offline: "Not staffed",
};

export function LiveStatusBadges({
  stationPrefix,
  online,
  bookings,
  knownPositions,
  now,
}: {
  stationPrefix: string;
  online: DashboardOnline[];
  bookings: DashboardBooking[];
  knownPositions: PositionRef[];
  now: Date;
}) {
  const onlinePositions: PositionRef[] = online.map((session) => ({
    facilityType: session.facilityType,
    infix: session.infix,
  }));
  const bookingPositions = bookings.map((b) => positionFromCallsign(b.callsign, b.facilityType));
  const fallback = isControlFacility(stationPrefix)
    ? DEFAULT_CONTROL_FACILITIES
    : DEFAULT_AIRPORT_FACILITIES;
  const knownSlots = collectKnownPositionSlots(
    [onlinePositions, bookingPositions, knownPositions],
    fallback,
  );
  const offlineSlots = uncoveredPositionSlots(knownSlots, onlinePositions);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {online.map((session) => (
        <div
          key={`${session.cid}-${session.callsign}`}
          className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${CARD.online}`}
        >
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT.online}`} />
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {session.callsign}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {session.facilityType} · {facilityLabel(session.facilityType)}
            </p>
            <p className={`mt-0.5 text-xs ${STATUS_TEXT.online}`}>{LABELS.online}</p>
          </div>
        </div>
      ))}

      {offlineSlots.map((slot) => {
        const status: Status = bookingSoon(slot, bookings, now) ? "soon" : "offline";
        const label = formatPositionSlotLabel(stationPrefix, slot);
        return (
          <div
            key={`${slot.facilityType}-${slot.infix ?? "generic"}`}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${CARD[status]}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {label}
                </span>
                <span className="truncate text-xs text-zinc-500">
                  {facilityLabel(slot.facilityType)}
                </span>
              </div>
              <p className={`mt-0.5 text-xs ${STATUS_TEXT[status]}`}>{LABELS[status]}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
