# Cursor Prompt — vatsim-atc.com (VATSIM ATC Coverage Prediction)

You are building **vatsim-atc.com**, a community tool for the VATSIM flight simulation network that predicts the likelihood of air traffic control coverage at any station, at any time. It fills the gap left by the discontinued vroute "ATC forecast" feature. It is NOT a live traffic map (VATSIM Radar owns that space) — this product is about **time**: "will Gatwick Tower be staffed on Saturday at 1900z?"

Build this as a production-quality TypeScript monorepo. Ask clarifying questions only if something below is genuinely ambiguous; otherwise make sensible decisions and document them in code comments.

---

## 1. Monorepo layout

Use pnpm workspaces:

```
vatsim-atc/
  apps/
    collector/        # Node service: polls VATSIM datafeed, writes sessions to Postgres
    web/              # Next.js 14+ (App Router) frontend + API routes
    bot/              # Discord bot (discord.js v14) — scaffold only for now, phase 2
  packages/
    core/             # Shared: callsign parsing, types, prediction engine, db client
  docker-compose.yml  # Postgres 16 + collector + web for local dev
  .env.example
```

- TypeScript strict mode everywhere. ESM modules.
- Postgres 16 via **Drizzle ORM** (schema-as-code, migrations with drizzle-kit).
- Shared DB client and schema live in `packages/core`.

## 2. Data source — VATSIM datafeed

- Endpoint: `https://data.vatsim.net/v3/vatsim-data.json` (JSON, refreshes ~every 15s).
- Poll every **60 seconds** with a proper User-Agent: `vatsim-atc.com collector (contact: <EMAIL_PLACEHOLDER>)`.
- Relevant array: `controllers[]` — fields include `cid`, `callsign`, `frequency`, `facility` (int), `rating` (int), `logon_time`, `last_updated`.
- Ignore entries with `facility === 0` (observers) and callsigns containing `_OBS`.
- Also poll the ATC bookings API once every 15 minutes: `https://atc-bookings.vatsim.net/api/booking` (public JSON). Store upcoming bookings.
- Handle fetch failures gracefully (timeout 10s, retry with backoff, never crash the loop; log and skip a cycle).

## 3. Collector — session tracking logic

Do NOT store raw snapshots. Maintain **sessions** by diffing consecutive polls:

- Keep an in-memory map of currently-open sessions keyed by `cid + callsign`.
- New controller appears → INSERT session row (`started_at = logon_time` from the feed, fall back to now).
- Controller present → UPDATE `last_seen_at`.
- Controller missing → do NOT close immediately. Grace period: close the session (set `ended_at = last_seen_at`) only after **3 consecutive missed polls** (~3 min), to absorb datafeed blips.
- On collector startup, recover: any session in DB with `ended_at IS NULL` and `last_seen_at` older than 5 minutes gets closed at `last_seen_at`.

## 4. Callsign parsing (packages/core)

Parse controller callsigns into structured form. Examples:

| Callsign      | station_prefix | infix | facility_type |
|---------------|---------------|-------|---------------|
| `EGKK_TWR`    | EGKK          | —     | TWR           |
| `EGKK_1_GND`  | EGKK          | 1     | GND           |
| `LON_S_CTR`   | LON           | S     | CTR           |
| `EGSS_F_APP`  | EGSS          | F     | APP           |
| `EKDK_D_CTR`  | EKDK          | D     | CTR           |

- Split on `_`. Last segment = facility type (DEL, GND, TWR, APP, DEP, CTR, FSS, RMP, RDO, TMU — treat unknown suffixes as OTHER).
- First segment = station prefix. Middle segments (if any) = infix (relief/sector designator).
- Normalize to uppercase. Write thorough unit tests (Vitest) for the parser — this is the highest-risk logic.

## 5. Database schema (Drizzle)

```
sessions:
  id            bigserial PK
  cid           integer NOT NULL
  callsign      text NOT NULL
  station_prefix text NOT NULL          -- indexed
  infix         text NULL
  facility_type text NOT NULL           -- indexed
  frequency     text NULL
  rating        integer NULL
  started_at    timestamptz NOT NULL
  ended_at      timestamptz NULL
  last_seen_at  timestamptz NOT NULL
  -- composite index (station_prefix, facility_type, started_at)

bookings:
  id            bigserial PK
  vatsim_booking_id integer UNIQUE
  callsign      text NOT NULL
  station_prefix text NOT NULL
  facility_type text NOT NULL
  starts_at     timestamptz NOT NULL
  ends_at       timestamptz NOT NULL
  type          text NULL               -- booking/event/training if provided
  fetched_at    timestamptz NOT NULL

stations:                               -- lightweight registry, populated lazily
  prefix        text PK
  name          text NULL
  first_seen_at timestamptz NOT NULL
  last_seen_at  timestamptz NOT NULL
```

## 6. Prediction engine (packages/core)

v1 is statistical, not ML:

- For a given `(station_prefix, facility_type)`, bucket historical sessions into **168 hour-of-week buckets** (UTC).
- For each bucket: over a rolling window of the last **26 weeks**, count in how many distinct weeks that hour had ≥15 minutes of coverage. Probability = covered_weeks / observed_weeks.
- Apply recency weighting: weeks 1–8 weight 1.5, weeks 9–17 weight 1.0, weeks 18–26 weight 0.6 (weighted proportion).
- If observed_weeks < 4, mark the result `low_confidence: true`.
- **Bookings override**: if a confirmed booking covers the queried time, return probability 0.98 with `source: "booking"`.
- Return shape: `{ probability: number, confidence: "low"|"normal", source: "history"|"booking", sampleWeeks: number }`.
- Precompute: a cron (node-cron in the collector app, hourly) materializes per-station hour-of-week probabilities into a `station_hourly_stats` table so web queries are single indexed reads. Include this table in the schema.

## 7. Web app (apps/web) — Next.js App Router

Pages:

1. `/` — search box (station prefix or airport ICAO, typeahead against `stations` table) + region summary strip ("currently online" counts by region derived from live sessions). No map.
2. `/station/[prefix]` — the core page:
   - Header: station prefix + name, current live status badges per facility (online now / booked soon), pulled from open sessions + bookings.
   - Time-window selector (default: next 2 hours; allow picking day + hour range up to 7 days ahead).
   - Metric cards: probability per facility type (DEL/GND/TWR/APP/CTR where applicable) for the selected window.
   - Hour-of-week heatmap (7×24 grid, UTC, green intensity ramp) per facility type with a facility tab switcher. Tooltip per cell: day, hour, percentage, sample size.
   - "Next 12 hours" forecast list and "Confirmed bookings" list side by side.
3. `/route` — placeholder page ("coming soon") — route-time-aware coverage is phase 2.
4. `/api-docs` — static page documenting the public API.

Public API (Next.js route handlers, JSON, CORS open, rate-limited ~60 req/min per IP):
- `GET /api/v1/station/:prefix` — live status + next-12h forecast.
- `GET /api/v1/station/:prefix/heatmap?facility=TWR` — 168-bucket array.
- `GET /api/v1/prediction?station=EGKK&facility=TWR&at=2026-07-11T19:00:00Z`.

Design:
- Tailwind. **Dark-mode-first** (dark default, light optional).
- Accent colour: amber/orange family — deliberately NOT VATSIM green (unofficial community tool).
- Clean, data-dense, fast. No hero sections, no marketing fluff on the home page — the search box IS the product.
- Footer: "Not affiliated with VATSIM. Data from the VATSIM public datafeed." + GitHub link placeholder.
- Cache aggressively: heatmap/prediction responses `s-maxage=3600`, live status `s-maxage=30`.

## 8. Discord bot (apps/bot) — scaffold only

Scaffold a discord.js v14 app with slash-command registration and one working command:
- `/coverage station:<prefix> facility:<choice>` → replies with an embed: live status + next-12h probabilities (calls the web API).
Leave subscription/alert features as TODO stubs.

## 9. Ops

- `docker-compose.yml`: postgres:16, collector, web. Volumes for pg data. Healthchecks.
- `.env.example`: `DATABASE_URL`, `CONTACT_EMAIL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `POLL_INTERVAL_MS=60000`.
- Collector logs structured JSON (pino). Log one summary line per poll: controllers seen, sessions opened/closed, poll duration.
- Graceful shutdown: SIGTERM closes open DB writes cleanly (do NOT close sessions on shutdown — they're still live).
- Seed script that generates ~8 weeks of plausible fake session data for local frontend dev so the UI isn't empty before real data accumulates.

## 10. Quality bar

- Vitest unit tests for: callsign parser (extensive), session diffing state machine, prediction bucketing/weighting maths.
- No `any`. Zod-validate the external datafeed and bookings payloads at the boundary.
- README per app explaining run/deploy.

Build order: packages/core (parser + schema + prediction) → apps/collector → apps/web → apps/bot scaffold.