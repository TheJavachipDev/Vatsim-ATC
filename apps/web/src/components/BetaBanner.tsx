export function BetaBanner() {
  return (
    <div
      className="border-b border-amber-500/20 bg-amber-500/[0.08] text-center text-sm"
      role="status"
    >
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6">
        <span className="font-semibold text-amber-800 dark:text-amber-300">Beta</span>
        <span className="text-zinc-600 dark:text-zinc-400">
          {" "}
          — This app is still in beta. The system is learning staffing patterns and forecasts will
          become more accurate over the next few weeks.
        </span>
      </div>
    </div>
  );
}
