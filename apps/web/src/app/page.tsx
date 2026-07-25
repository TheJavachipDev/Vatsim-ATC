import { StationSearch } from "@/components/StationSearch";
import { getRegionSummary, getTotalOnline } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function RegionStrip() {
  let regions: { region: string; online: number }[] = [];
  let total = 0;
  try {
    [regions, total] = await Promise.all([getRegionSummary(), getTotalOnline()]);
  } catch {
    return null;
  }
  if (total === 0) return null;

  return (
    <div className="panel mt-8">
      <div className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {total} controllers online right now
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {regions.map((r) => (
          <span
            key={r.region}
            className="chip chip-inactive text-sm"
          >
            {r.region}
            <span className="font-mono text-zinc-500">{r.online}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl py-10 sm:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Will there be ATC?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
          See how likely VATSIM controllers are to be online at any station — before you file your
          flight plan.
        </p>
      </div>

      <div className="mt-8">
        <StationSearch />
      </div>

      <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-600">
        Try <span className="font-mono text-zinc-500">EGKK</span>,{" "}
        <span className="font-mono text-zinc-500">KTPA</span>, or search by city name
      </p>

      <RegionStrip />
    </div>
  );
}
