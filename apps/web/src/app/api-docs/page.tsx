export const metadata = {
  title: "API — vatsim-atc.com",
};

interface Endpoint {
  method: string;
  path: string;
  description: string;
  params?: { name: string; description: string }[];
  example: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/station/:prefix",
    description: "Live controller status plus an hour-by-hour coverage forecast for the next 12 hours.",
    example: "/api/v1/station/EGKK",
  },
  {
    method: "GET",
    path: "/api/v1/station/:prefix/heatmap",
    description: "The 168-bucket (7×24) hour-of-week coverage probabilities for one facility.",
    params: [{ name: "facility", description: "One of DEL, GND, TWR, APP, DEP, CTR, FSS, ..." }],
    example: "/api/v1/station/EGKK/heatmap?facility=TWR",
  },
  {
    method: "GET",
    path: "/api/v1/prediction",
    description: "Point-in-time coverage probability for a station and facility.",
    params: [
      { name: "station", description: "Station prefix, e.g. EGKK" },
      { name: "facility", description: "Facility type, e.g. TWR" },
      { name: "at", description: "ISO 8601 timestamp (defaults to now)" },
    ],
    example: "/api/v1/prediction?station=EGKK&facility=TWR&at=2026-07-11T19:00:00Z",
  },
];

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Public API</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        All endpoints return JSON, allow cross-origin requests, and are rate-limited to roughly 60
        requests per minute per IP. Responses are cached at the edge; prediction and heatmap data
        change at most hourly.
      </p>

      <div className="mt-8 space-y-6">
        {ENDPOINTS.map((endpoint) => (
          <div key={endpoint.path} className="panel">
            <div className="flex items-center gap-3">
              <span className="rounded bg-green-500/15 px-2 py-0.5 font-mono text-xs text-green-300">
                {endpoint.method}
              </span>
              <code className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{endpoint.path}</code>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{endpoint.description}</p>
            {endpoint.params && (
              <ul className="mt-3 space-y-1 text-sm">
                {endpoint.params.map((param) => (
                  <li key={param.name} className="flex gap-2">
                    <code className="font-mono text-accent-soft">{param.name}</code>
                    <span className="text-zinc-500">— {param.description}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-600">Example</span>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-100 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {endpoint.example}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
