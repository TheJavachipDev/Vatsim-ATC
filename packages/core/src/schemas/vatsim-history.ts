import { z } from "zod";

/**
 * Boundary schemas for the VATSIM Core ATC history API
 * (`GET https://api.vatsim.net/v2/atc/history`).
 */

const ConnectionIdObjectSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
  })
  .passthrough();

export const VatsimHistoryItemSchema = z
  .object({
    connection_id: z.union([ConnectionIdObjectSchema, z.string(), z.number()]),
    vatsim_id: z.number().int(),
    rating: z.number().int().nullish(),
    callsign: z.string(),
    start: z.string(),
    end: z.string().nullish().nullable(),
  })
  .passthrough();

export type VatsimHistoryItem = z.infer<typeof VatsimHistoryItemSchema>;

export const VatsimHistoryResponseSchema = z.object({
  items: z.array(z.unknown()),
  count: z.number().int().nonnegative(),
});

export type VatsimHistoryResponse = z.infer<typeof VatsimHistoryResponseSchema>;

export interface ParsedHistoryItem {
  externalId: string;
  cid: number;
  callsign: string;
  rating: number | null;
  startedAt: Date;
  endedAt: Date;
}

/** Normalize `connection_id` from the API into a stable string key. */
export function normalizeConnectionId(
  connectionId: VatsimHistoryItem["connection_id"],
): string | null {
  if (typeof connectionId === "object" && connectionId !== null && "id" in connectionId) {
    return String(connectionId.id);
  }
  if (typeof connectionId === "string" || typeof connectionId === "number") {
    return String(connectionId);
  }
  return null;
}

/**
 * Parse and validate a single history item. Returns null for open sessions,
 * malformed payloads, or unparseable timestamps.
 */
export function parseHistoryItem(raw: unknown): ParsedHistoryItem | null {
  const result = VatsimHistoryItemSchema.safeParse(raw);
  if (!result.success) return null;

  const item = result.data;
  if (!item.end) return null;

  const externalId = normalizeConnectionId(item.connection_id);
  if (!externalId) return null;

  const startedAt = new Date(item.start);
  const endedAt = new Date(item.end);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return null;

  return {
    externalId,
    cid: item.vatsim_id,
    callsign: item.callsign,
    rating: item.rating ?? null,
    startedAt,
    endedAt,
  };
}
