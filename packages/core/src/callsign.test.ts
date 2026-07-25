import { describe, expect, it } from "vitest";
import { facilityFromVatsimId, isObserverCallsign, parseCallsign } from "./callsign.js";

describe("parseCallsign", () => {
  it.each([
    ["EGKK_TWR", "EGKK", null, "TWR"],
    ["EGKK_1_GND", "EGKK", "1", "GND"],
    ["LON_S_CTR", "LON", "S", "CTR"],
    ["EGSS_F_APP", "EGSS", "F", "APP"],
    ["EKDK_D_CTR", "EKDK", "D", "CTR"],
    ["RU-SC_FSS", "RU-SC", null, "FSS"],
    ["LON_NW_CTR", "LON", "NW", "CTR"],
  ])("parses %s", (callsign, prefix, infix, facility) => {
    const parsed = parseCallsign(callsign);
    expect(parsed.stationPrefix).toBe(prefix);
    expect(parsed.infix).toBe(infix);
    expect(parsed.facilityType).toBe(facility);
  });

  it("normalizes to uppercase", () => {
    const parsed = parseCallsign("egkk_twr");
    expect(parsed.callsign).toBe("EGKK_TWR");
    expect(parsed.stationPrefix).toBe("EGKK");
    expect(parsed.facilityType).toBe("TWR");
  });

  it("joins multiple infix segments", () => {
    const parsed = parseCallsign("EDDW_APP_X_APP");
    expect(parsed.stationPrefix).toBe("EDDW");
    expect(parsed.infix).toBe("APP_X");
    expect(parsed.facilityType).toBe("APP");
  });

  it("handles a real-world alphanumeric infix (LIRR_TW1_APP)", () => {
    const parsed = parseCallsign("LIRR_TW1_APP");
    expect(parsed.stationPrefix).toBe("LIRR");
    expect(parsed.infix).toBe("TW1");
    expect(parsed.facilityType).toBe("APP");
  });

  it("handles single-letter infix relief position (ULLI_A_TWR)", () => {
    const parsed = parseCallsign("ULLI_A_TWR");
    expect(parsed.stationPrefix).toBe("ULLI");
    expect(parsed.infix).toBe("A");
    expect(parsed.facilityType).toBe("TWR");
  });

  it("maps unknown suffixes to OTHER", () => {
    const parsed = parseCallsign("EGKK_XYZ");
    expect(parsed.stationPrefix).toBe("EGKK");
    expect(parsed.infix).toBe(null);
    expect(parsed.facilityType).toBe("OTHER");
  });

  it("treats a single segment as station prefix with OTHER facility", () => {
    const parsed = parseCallsign("SY");
    expect(parsed.stationPrefix).toBe("SY");
    expect(parsed.infix).toBe(null);
    expect(parsed.facilityType).toBe("OTHER");
  });

  it("recognizes ATIS positions", () => {
    expect(parseCallsign("EGKK_ATIS").facilityType).toBe("ATIS");
  });

  it("recognizes all known facility suffixes", () => {
    for (const facility of ["DEL", "GND", "TWR", "APP", "DEP", "CTR", "FSS", "ATIS", "RMP", "RDO", "TMU"]) {
      expect(parseCallsign(`ZZZZ_${facility}`).facilityType).toBe(facility);
    }
  });

  it("collapses repeated and trailing underscores", () => {
    const parsed = parseCallsign("EGKK__1__GND_");
    expect(parsed.stationPrefix).toBe("EGKK");
    expect(parsed.infix).toBe("1");
    expect(parsed.facilityType).toBe("GND");
  });

  it("handles empty input defensively", () => {
    const parsed = parseCallsign("");
    expect(parsed.stationPrefix).toBe("");
    expect(parsed.facilityType).toBe("OTHER");
  });

  it("maps VATSIM facility ids when the callsign suffix is non-standard", () => {
    expect(parseCallsign("RST_SUP", { vatsimFacility: 1 }).facilityType).toBe("FSS");
    expect(parseCallsign("RST_SUP", { vatsimFacility: 1 }).stationPrefix).toBe("RST");
    expect(parseCallsign("RST_SUP", { vatsimFacility: 1 }).infix).toBe(null);
    expect(parseCallsign("EGKK_XYZ", { vatsimFacility: 4 }).facilityType).toBe("TWR");
  });

  it("prefers an explicit callsign suffix over the datafeed facility id", () => {
    expect(parseCallsign("EGKK_TWR", { vatsimFacility: 6 }).facilityType).toBe("TWR");
  });

  it("maps datafeed facility integers", () => {
    expect(facilityFromVatsimId(1)).toBe("FSS");
    expect(facilityFromVatsimId(6)).toBe("CTR");
    expect(facilityFromVatsimId(99)).toBeNull();
  });
});

describe("isObserverCallsign", () => {
  it.each([
    ["EGKK_OBS", true],
    ["LON_M_OBS", true],
    ["egkk_obs", true],
    ["EGKK_TWR", false],
    ["EGKK_1_GND", false],
  ])("classifies %s", (callsign, expected) => {
    expect(isObserverCallsign(callsign)).toBe(expected);
  });
});
