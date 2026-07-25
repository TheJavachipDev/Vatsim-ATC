import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root .env when present (local dev); container envs win otherwise.
const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, "../../../.env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  contactEmail: process.env.CONTACT_EMAIL ?? "unknown@example.com",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
  bookingsIntervalMs: Number(process.env.BOOKINGS_INTERVAL_MS ?? 15 * 60_000),
  datafeedUrl: process.env.VATSIM_DATAFEED_URL ?? "https://data.vatsim.net/v3/vatsim-data.json",
  bookingsUrl: process.env.VATSIM_BOOKINGS_URL ?? "https://atc-bookings.vatsim.net/api/booking",
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 10_000),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;

export const userAgent = `vatsim-atc.com collector (contact: ${config.contactEmail})`;
