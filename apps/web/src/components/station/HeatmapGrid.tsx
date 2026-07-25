"use client";

import type { FacilityType, HourlyStat } from "@vatsim-atc/core/client";
import { useState } from "react";
import { DAY_NAMES, formatPercent, formatUtcHour, heatStyle } from "@/lib/format";
import { facilityLabel } from "@/lib/facilities";

interface FacilityBuckets {
  facility: FacilityType;
  buckets: HourlyStat[];
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface HoverInfo {
  day: string;
  hour: number;
  probability: number;
  sample: number;
  lowConfidence: boolean;
}

export function HeatmapGrid({ facilityStats }: { facilityStats: FacilityBuckets[] }) {
  const [selected, setSelected] = useState<FacilityType>(
    facilityStats.find((f) => f.facility === "TWR")?.facility ?? facilityStats[0]?.facility ?? "TWR",
  );
  const [hover, setHover] = useState<HoverInfo | null>(null);

  if (facilityStats.length === 0) {
    return (
      <div className="empty-state">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No live session history yet for this station.
        </p>
        <p className="text-xs text-zinc-500">
          The weekly pattern will fill in as controllers staff this station on VATSIM.
        </p>
      </div>
    );
  }

  const active = facilityStats.find((f) => f.facility === selected) ?? facilityStats[0]!;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {facilityStats.map((f) => (
            <button
              key={f.facility}
              type="button"
              onClick={() => {
                setSelected(f.facility);
                setHover(null);
              }}
              className={`chip font-mono text-xs ${f.facility === active.facility ? "chip-active" : "chip-inactive"}`}
            >
              {f.facility}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 rounded-sm bg-zinc-200 dark:bg-zinc-800" /> Unlikely
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-3.5 rounded-sm"
              style={{ background: "linear-gradient(90deg, rgba(52,211,153,0.3), rgba(52,211,153,0.9))" }}
            />{" "}
            Likely
          </span>
        </div>
      </div>

      <div
        className="mb-3 flex min-h-9 items-center gap-2 rounded-lg bg-zinc-100/80 px-3 py-2 text-sm dark:bg-zinc-950/70"
        aria-live="polite"
      >
        {hover ? (
          <>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {hover.day} {formatUtcHour(hover.hour)} UTC
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">·</span>
            <span className="font-semibold tabular-nums text-emerald-500 dark:text-emerald-400">
              {formatPercent(hover.probability)}
            </span>
            <span className="text-zinc-500">chance of {facilityLabel(active.facility)}</span>
            {hover.lowConfidence && (
              <span className="text-xs text-zinc-500">(limited data)</span>
            )}
          </>
        ) : (
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            Hover a cell for details
          </span>
        )}
      </div>

      <div
        className="panel-inset overflow-x-auto p-3 sm:p-4"
        onMouseLeave={() => setHover(null)}
      >
        <div className="inline-block min-w-full">
          <div className="mb-1.5 flex pl-11">
            {HOURS.map((h) => (
              <div
                key={h}
                className="w-7 shrink-0 text-center font-mono text-[10px] text-zinc-400 dark:text-zinc-500"
              >
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </div>
            ))}
          </div>
          {DAY_NAMES.map((day, dayIndex) => (
            <div key={day} className="flex items-center">
              <div className="w-11 shrink-0 pr-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {day}
              </div>
              {HOURS.map((hour) => {
                const bucket = active.buckets[dayIndex * 24 + hour];
                const probability = bucket?.probability ?? 0;
                const lowConfidence = bucket?.lowConfidence ?? true;
                const sample = bucket?.sampleWeeks ?? 0;
                const isHovered =
                  hover?.day === day && hover.hour === hour;
                return (
                  <button
                    key={hour}
                    type="button"
                    className={`m-0.5 h-6 w-7 shrink-0 rounded-[5px] transition duration-100 hover:ring-2 hover:ring-zinc-900/15 dark:hover:ring-white/25 ${
                      isHovered ? "ring-2 ring-accent/70 dark:ring-accent/60" : ""
                    }`}
                    style={heatStyle(probability, lowConfidence)}
                    onMouseEnter={() =>
                      setHover({ day, hour, probability, sample, lowConfidence })
                    }
                    aria-label={`${day} ${formatUtcHour(hour)}: ${formatPercent(probability)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Typical coverage by day and hour (UTC). Faded cells have limited historical data.
      </p>
    </div>
  );
}
