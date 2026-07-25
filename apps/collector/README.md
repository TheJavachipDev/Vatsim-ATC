# @vatsim-atc/collector

Node service that polls the VATSIM datafeed and ATC bookings API and turns them
into controller *sessions* and *bookings* stored in Postgres. An hourly cron
materializes coverage probabilities into `station_hourly_stats`.

## What it does

- Polls `data.vatsim.net/v3/vatsim-data.json` every `POLL_INTERVAL_MS` (default 60s),
  ignoring observers (`facility === 0` or `_OBS` callsigns).
- Diffs consecutive polls into sessions via the shared `SessionTracker`: opens on
  first sight, refreshes `last_seen_at` while present, and closes only after three
  consecutive missed polls to absorb datafeed blips.
- Polls the bookings API every 15 minutes and upserts upcoming bookings.
- Recomputes hourly stats on the hour.
- On startup, closes sessions that went stale (>5 min) while the collector was down
  and rehydrates the rest.

## Run

```bash
# From the repo root, with Postgres running and migrations applied:
pnpm --filter @vatsim-atc/core build
pnpm --filter @vatsim-atc/collector dev
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | — (required) | Postgres connection string |
| `CONTACT_EMAIL` | `unknown@example.com` | Advertised in the datafeed User-Agent |
| `POLL_INTERVAL_MS` | `60000` | Datafeed poll interval |
| `BOOKINGS_INTERVAL_MS` | `900000` | Bookings poll interval |
| `LOG_LEVEL` | `info` | pino log level |

## Historical backfill

One-shot script to seed `sessions` from the VATSIM Core history API. It does
**not** run on collector startup.

```bash
pnpm --filter @vatsim-atc/core build
pnpm --filter @vatsim-atc/collector backfill

# Deterministic 8-week synthetic data when the history API is down:
pnpm --filter @vatsim-atc/collector backfill -- --seed

# Or use the full reset seed script (wipes live data too):
pnpm --filter @vatsim-atc/core db:seed

# Resume API backfill from saved offset, or restart from zero:
pnpm --filter @vatsim-atc/collector backfill -- --fresh
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKFILL_WEEKS` | `30` | How far back to page before stopping |
| `BACKFILL_PAGE_SIZE` | `250` | Page size (steps down to 100 on API 400) |
| `BACKFILL_DELAY_MS` | `1000` | Delay between requests |

Progress is saved to `backfill_state` after each page. On completion the script
refreshes `station_hourly_stats` once.

## Logs

Structured JSON via pino. Each poll emits one summary line with the number of
controllers seen, sessions opened/closed, currently open sessions, and duration.
