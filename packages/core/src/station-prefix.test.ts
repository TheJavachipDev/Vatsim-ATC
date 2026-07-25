import { describe, expect, it } from "vitest";
import {
  preferIcaoStationPrefix,
  stationLookupPrefixes,
  stationPrefixesMatch,
} from "./station-prefix.js";

describe("stationLookupPrefixes", () => {
  it("returns US ICAO plus the K-dropped localizer", () => {
    expect(stationLookupPrefixes("KJAX")).toEqual(["KJAX", "JAX"]);
    expect(stationLookupPrefixes("ktpa")).toEqual(["KTPA", "TPA"]);
  });

  it("returns Canadian ICAO plus the C-dropped localizer", () => {
    expect(stationLookupPrefixes("CYYZ")).toEqual(["CYYZ", "YYZ"]);
  });

  it("leaves non-K/C prefixes alone", () => {
    expect(stationLookupPrefixes("EGKK")).toEqual(["EGKK"]);
    expect(stationLookupPrefixes("LON")).toEqual(["LON"]);
    expect(stationLookupPrefixes("PANC")).toEqual(["PANC"]);
  });

  it("does not invent a K for 3-letter localizers alone", () => {
    // LON must not become KLON — that is a UK FIR, not Tampa-style localizer.
    expect(stationLookupPrefixes("LON")).toEqual(["LON"]);
    expect(stationLookupPrefixes("JAX")).toEqual(["JAX"]);
  });
});

describe("stationPrefixesMatch", () => {
  it("matches KJAX to JAX", () => {
    expect(stationPrefixesMatch("KJAX", "JAX")).toBe(true);
    expect(stationPrefixesMatch("JAX", "KJAX")).toBe(true);
  });

  it("does not match unrelated stations", () => {
    expect(stationPrefixesMatch("KJAX", "KTPA")).toBe(false);
    expect(stationPrefixesMatch("EGKK", "KK")).toBe(false);
  });
});

describe("preferIcaoStationPrefix", () => {
  it("expands a 3-letter localizer to K-prefix", () => {
    expect(preferIcaoStationPrefix("JAX")).toBe("KJAX");
  });

  it("leaves ICAO prefixes unchanged", () => {
    expect(preferIcaoStationPrefix("KJAX")).toBe("KJAX");
    expect(preferIcaoStationPrefix("EGKK")).toBe("EGKK");
  });
});
