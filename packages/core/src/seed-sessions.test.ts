import { describe, expect, it } from "vitest";
import {
  defaultSeedStationDef,
  generateSeedSessions,
  seedForPrefix,
} from "./seed-sessions.js";

describe("defaultSeedStationDef", () => {
  it("uses US hours for K-prefixed airports", () => {
    const def = defaultSeedStationDef("KTPA", "Tampa International Airport");
    expect(def.open).toBe(14);
    expect(def.close).toBe(4);
    expect(def.facilities).toEqual(["GND", "TWR", "APP"]);
    expect(def.name).toBe("Tampa International Airport");
  });

  it("uses FIR defaults for short prefixes", () => {
    const def = defaultSeedStationDef("LON");
    expect(def.facilities).toContain("CTR");
  });
});

describe("seedForPrefix", () => {
  it("is stable for the same prefix", () => {
    expect(seedForPrefix("KTPA")).toBe(seedForPrefix("KTPA"));
    expect(seedForPrefix("KTPA")).not.toBe(seedForPrefix("EGKK"));
  });

  it("generates sessions for arbitrary airports", () => {
    const def = defaultSeedStationDef("KTPA", "Tampa");
    const { sessions } = generateSeedSessions({
      weeks: 2,
      stations: [def],
      seed: seedForPrefix("KTPA"),
      now: new Date("2026-07-09T12:00:00Z"),
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.stationPrefix === "KTPA")).toBe(true);
  });
});
