"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface StationSummary {
  prefix: string;
  name: string | null;
  iata?: string | null;
  faa?: string | null;
}

export function StationSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StationSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/stations?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { stations: StationSummary[] };
        setResults(data.stations);
        setOpen(true);
        setHighlight(0);
      } catch {
        /* aborted or network error */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (prefix: string) => {
    const target = prefix.trim().toUpperCase();
    if (target.length === 0) return;
    setOpen(false);
    router.push(`/station/${encodeURIComponent(target)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[highlight];
      go(chosen ? chosen.prefix : query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search ICAO, IATA, or FAA — KFLL, FLL, EGLL, LHR…"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-2xl border border-zinc-300/80 bg-white/90 py-4 pl-12 pr-5 text-lg text-zinc-900 shadow-lg shadow-zinc-900/5 outline-none transition placeholder:text-zinc-400 focus:border-accent/60 focus:ring-2 focus:ring-accent/25 dark:border-zinc-700/80 dark:bg-zinc-900/80 dark:text-zinc-100 dark:shadow-black/20 dark:placeholder:text-zinc-600"
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
            …
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl shadow-zinc-900/10 dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-black/40">
          {results.map((station, i) => (
            <li key={station.prefix}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => go(station.prefix)}
                className={`flex w-full items-center justify-between px-5 py-3.5 text-left transition ${
                  i === highlight
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {station.prefix}
                  </span>
                  {station.iata && station.iata !== station.prefix && (
                    <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-700/80 dark:text-zinc-300">
                      {station.iata}
                    </span>
                  )}
                </span>
                {station.name && (
                  <span className="truncate pl-3 text-sm text-zinc-500">{station.name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
