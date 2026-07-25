# vatsim-atc.com

A community tool for the VATSIM network that predicts the likelihood of air traffic
control coverage at any station, at any time. It answers questions like "will Gatwick
Tower be staffed on Saturday at 1900z?" — filling the gap left by the discontinued
vroute ATC forecast. This is not a live traffic map; the product is about **time**.

> Not affiliated with VATSIM. Data comes from the VATSIM public datafeed.

## Architecture

A pnpm-workspace TypeScript monorepo:

```
vatsim-atc/
  apps/
    collector/   # Polls the VATSIM datafeed + bookings API, writes sessions to Postgres
    web/         # Next.js (App Router) frontend + public JSON API
    bot/         # Discord bot scaffold (discord.js v14)
  packages/
    core/        # Shared: callsign parsing, types, prediction engine, Drizzle schema/client
```

The `collector` diffs consecutive datafeed polls into controller *sessions*, an hourly
cron materializes per-station coverage probabilities into `station_hourly_stats`, and the
`web` app reads those pre-computed stats for fast, cached responses.

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- Docker (optional, for the local Postgres + services stack)

## Quickstart

```bash
pnpm install
cp .env.example .env            # edit CONTACT_EMAIL at minimum

# Start Postgres (via Docker) plus the collector and web app:
docker compose up --build

# Optional: seed demo data so the UI has coverage stats on day one:
pnpm db:seed
```

Then open http://localhost:3000 and try `/station/EGKK`.

### Running services individually

```bash
pnpm --filter @vatsim-atc/core build     # build shared library first
pnpm --filter @vatsim-atc/collector dev  # start the collector
pnpm --filter @vatsim-atc/web dev        # start the Next.js app
```

## Testing

```bash
pnpm test        # Vitest across all packages
pnpm typecheck   # tsc --noEmit across all packages
```

The highest-risk logic (callsign parser, session state machine, prediction maths) has
extensive unit coverage in `packages/core`.

## Public API

Documented at `/api-docs` on the running web app. Key endpoints:

- `GET /api/v1/station/:prefix` — live status + next-12h forecast
- `GET /api/v1/station/:prefix/heatmap?facility=TWR` — 168-bucket hour-of-week array
- `GET /api/v1/prediction?station=EGKK&facility=TWR&at=2026-07-11T19:00:00Z`
