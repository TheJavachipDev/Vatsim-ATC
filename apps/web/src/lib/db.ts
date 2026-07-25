import { createDb, type Database } from "@vatsim-atc/core";

declare global {
  // Reuse the pool across hot reloads in development.
  // eslint-disable-next-line no-var
  var __vatsimAtcDb: Database | undefined;
}

export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__vatsimAtcDb) {
    globalThis.__vatsimAtcDb = createDb(url).db;
  }
  return globalThis.__vatsimAtcDb;
}
