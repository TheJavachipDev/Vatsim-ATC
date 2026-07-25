import { dbSchema } from "@vatsim-atc/core";
import { lookupStationName, resolveStationPrefix } from "./airport-search";
import { getDb } from "./db";

const { stations } = dbSchema;

/** Register interest in a station so the collector can attach live sessions to it. */
export async function registerStation(prefix: string): Promise<void> {
  const normalized = resolveStationPrefix(prefix);
  const name = lookupStationName(normalized);
  const db = getDb();
  const now = new Date();

  await db
    .insert(stations)
    .values({ prefix: normalized, name, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: stations.prefix,
      set: {
        ...(name ? { name } : {}),
        lastSeenAt: now,
      },
    });
}
