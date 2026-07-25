"use client";

import { DAY_NAMES } from "@/lib/format";
import { useState } from "react";

const HOUR_MS = 60 * 60 * 1000;

export interface TimeWindow {
  start: Date;
  end: Date;
  label: string;
}

export function nextHours(now: Date, hours: number): TimeWindow {
  return { start: now, end: new Date(now.getTime() + hours * HOUR_MS), label: `Next ${hours}h` };
}

const QUICK = [2, 6, 12];

export function TimeWindowSelector({
  now,
  value,
  onChange,
}: {
  now: Date;
  value: TimeWindow;
  onChange: (window: TimeWindow) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);

  const setCustom = (dayOffset: number, startHour: number, endHour: number) => {
    const base = new Date(now);
    base.setUTCHours(0, 0, 0, 0);
    const day = new Date(base.getTime() + dayOffset * 24 * HOUR_MS);
    const start = new Date(day.getTime() + startHour * HOUR_MS);
    const end = new Date(day.getTime() + endHour * HOUR_MS);
    const dayName = DAY_NAMES[start.getUTCDay()];
    onChange({
      start,
      end,
      label: `${dayName} ${String(startHour).padStart(2, "0")}00z–${String(endHour).padStart(2, "0")}00z`,
    });
  };

  const dayOptions = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + i);
    return { offset: i, label: i === 0 ? "Today" : `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}` };
  });

  const customDayOffset = Math.max(
    0,
    Math.round(
      (startOfUtcDay(value.start).getTime() - startOfUtcDay(now).getTime()) / (24 * HOUR_MS),
    ),
  );

  const isQuick = QUICK.some((h) => value.label === `Next ${h}h`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-zinc-500">When</span>
        {QUICK.map((h) => {
          const active = value.label === `Next ${h}h`;
          return (
            <button
              key={h}
              type="button"
              onClick={() => {
                onChange(nextHours(now, h));
                setShowCustom(false);
              }}
              className={`chip ${active ? "chip-active" : "chip-inactive"}`}
            >
              Next {h}h
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={`chip ${!isQuick || showCustom ? "chip-active" : "chip-inactive"}`}
        >
          Pick a time…
        </button>
      </div>

      {showCustom && (
        <div className="panel-inset flex flex-wrap items-center gap-2 p-3">
          <select
            value={customDayOffset}
            onChange={(e) =>
              setCustom(Number(e.target.value), value.start.getUTCHours(), value.end.getUTCHours())
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-accent/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {dayOptions.map((d) => (
              <option key={d.offset} value={d.offset}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={value.start.getUTCHours()}
            onChange={(e) =>
              setCustom(customDayOffset, Number(e.target.value), value.end.getUTCHours())
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-800 outline-none focus:border-accent/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}00z
              </option>
            ))}
          </select>
          <span className="text-sm text-zinc-500 dark:text-zinc-600">to</span>
          <select
            value={value.end.getUTCHours() === 0 ? 24 : value.end.getUTCHours()}
            onChange={(e) =>
              setCustom(customDayOffset, value.start.getUTCHours(), Number(e.target.value))
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-800 outline-none focus:border-accent/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}00z
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-zinc-500 sm:text-sm">
        Showing forecast for{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{value.label}</span>
      </p>
    </div>
  );
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
