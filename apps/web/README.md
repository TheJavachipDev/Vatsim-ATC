# @vatsim-atc/web

Next.js (App Router) frontend and public JSON API for vatsim-atc.com. Dark-mode-first,
amber accent, deliberately not VATSIM green (this is an unofficial community tool).

## Pages

- `/` — search box (typeahead against the `stations` table) plus a "currently online"
  region strip. The search box is the product; no marketing fluff.
- `/station/[prefix]` — live status badges, a time-window coverage forecast, an
  hour-of-week heatmap per facility, a next-12-hours table, and confirmed bookings.
- `/route` — placeholder for phase-2 route-time coverage.
- `/api-docs` — documents the public API.

## Public API

| Endpoint | Cache |
|----------|-------|
| `GET /api/v1/station/:prefix` | `s-maxage=30` |
| `GET /api/v1/station/:prefix/heatmap?facility=TWR` | `s-maxage=3600` |
| `GET /api/v1/prediction?station=EGKK&facility=TWR&at=<iso>` | `s-maxage=3600` |
| `GET /api/v1/stations?q=` | `s-maxage=60` (typeahead) |

All responses are JSON with open CORS and a ~60 req/min per-IP rate limit.

## Run

```bash
# From the repo root, with Postgres running, migrated, and (ideally) seeded:
pnpm --filter @vatsim-atc/core build
pnpm --filter @vatsim-atc/web dev
```

Requires `DATABASE_URL` in the environment (loaded from the repo-root `.env` in
Docker Compose, or export it directly for local `next dev`).

## Deploy

`next build` produces a standalone server (`output: "standalone"`). The included
Dockerfile builds it from the repo root and runs `node apps/web/server.js`.
