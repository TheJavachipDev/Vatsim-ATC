export const metadata = {
  title: "Route forecast (coming soon) — vatsim-atc.com",
};

export default function RoutePage() {
  return (
    <div className="mx-auto max-w-2xl py-20 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Route-time coverage</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Coming soon. Enter a route and departure time to see the likelihood of ATC coverage at each
        point along the way, timed to when you will actually be there.
      </p>
      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-600">
        For now, check coverage per station from the home page.
      </p>
    </div>
  );
}
