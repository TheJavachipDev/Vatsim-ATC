import { describe, expect, it } from "vitest";
import {
  collectKnownPositionSlots,
  formatPositionSlotLabel,
  isPositionCovered,
  positionFromCallsign,
  uncoveredPositionSlots,
} from "./position-slots.js";

describe("isPositionCovered", () => {
  it("treats a generic controller as covering all sectors", () => {
    const online = [positionFromCallsign("EGKK_GND")];
    expect(isPositionCovered({ facilityType: "GND", infix: "N" }, online)).toBe(true);
    expect(isPositionCovered({ facilityType: "GND", infix: "S" }, online)).toBe(true);
    expect(isPositionCovered({ facilityType: "GND", infix: null }, online)).toBe(true);
  });

  it("treats sector controllers as covering only their sector", () => {
    const online = [positionFromCallsign("EGKK_N_GND")];
    expect(isPositionCovered({ facilityType: "GND", infix: "N" }, online)).toBe(true);
    expect(isPositionCovered({ facilityType: "GND", infix: "S" }, online)).toBe(false);
    expect(isPositionCovered({ facilityType: "GND", infix: null }, online)).toBe(false);
  });

  it("handles multiple sector controllers at once", () => {
    const online = [
      positionFromCallsign("EGKK_N_GND"),
      positionFromCallsign("EGKK_S_GND"),
    ];
    expect(isPositionCovered({ facilityType: "GND", infix: "N" }, online)).toBe(true);
    expect(isPositionCovered({ facilityType: "GND", infix: "S" }, online)).toBe(true);
    expect(isPositionCovered({ facilityType: "GND", infix: null }, online)).toBe(false);
  });
});

describe("collectKnownPositionSlots", () => {
  it("returns default generic slots when nothing is known", () => {
    expect(collectKnownPositionSlots([])).toEqual([
      { facilityType: "GND", infix: null },
      { facilityType: "TWR", infix: null },
      { facilityType: "APP", infix: null },
      { facilityType: "CTR", infix: null },
    ]);
  });

  it("accepts control-facility fallbacks for Center/FSS stations", () => {
    expect(collectKnownPositionSlots([], ["CTR", "FSS"])).toEqual([
      { facilityType: "CTR", infix: null },
      { facilityType: "FSS", infix: null },
    ]);
  });

  it("creates sector slots when sectors are known", () => {
    const slots = collectKnownPositionSlots([
      [positionFromCallsign("EGKK_N_GND"), positionFromCallsign("EGKK_S_GND")],
    ]);
    expect(slots).toEqual([
      { facilityType: "GND", infix: "N" },
      { facilityType: "GND", infix: "S" },
    ]);
  });

  it("includes a generic slot when generic positions have been seen", () => {
    const slots = collectKnownPositionSlots([
      [
        positionFromCallsign("EGKK_N_GND"),
        positionFromCallsign("EGKK_S_GND"),
        positionFromCallsign("EGKK_GND"),
      ],
    ]);
    expect(slots).toEqual([
      { facilityType: "GND", infix: "N" },
      { facilityType: "GND", infix: "S" },
      { facilityType: "GND", infix: null },
    ]);
  });

  it("keeps a single generic slot for airports without sectors", () => {
    const slots = collectKnownPositionSlots([[positionFromCallsign("EGKK_TWR")]]);
    expect(slots).toEqual([{ facilityType: "TWR", infix: null }]);
  });
});

describe("uncoveredPositionSlots", () => {
  it("hides sector offline cards when a generic controller is online", () => {
    const known = collectKnownPositionSlots([
      [positionFromCallsign("EGKK_N_GND"), positionFromCallsign("EGKK_S_GND")],
    ]);
    const online = [positionFromCallsign("EGKK_GND")];
    expect(uncoveredPositionSlots(known, online)).toEqual([]);
  });

  it("shows only the missing sectors when one sector is online", () => {
    const known = collectKnownPositionSlots([
      [positionFromCallsign("EGKK_N_GND"), positionFromCallsign("EGKK_S_GND")],
    ]);
    const online = [positionFromCallsign("EGKK_N_GND")];
    expect(uncoveredPositionSlots(known, online)).toEqual([
      { facilityType: "GND", infix: "S" },
    ]);
  });

  it("collapses all-offline sectors to a single generic facility card", () => {
    const known = collectKnownPositionSlots([
      [
        positionFromCallsign("EGKK_N_GND"),
        positionFromCallsign("EGKK_S_GND"),
        positionFromCallsign("EGKK_GND"),
        positionFromCallsign("EGKK_TWR"),
      ],
    ]);
    expect(uncoveredPositionSlots(known, [])).toEqual([
      { facilityType: "GND", infix: null },
      { facilityType: "TWR", infix: null },
    ]);
  });

  it("does not show an uncovered generic card when sectors are staffed", () => {
    const known = collectKnownPositionSlots([
      [
        positionFromCallsign("EGKK_N_GND"),
        positionFromCallsign("EGKK_S_GND"),
        positionFromCallsign("EGKK_GND"),
      ],
    ]);
    const online = [
      positionFromCallsign("EGKK_N_GND"),
      positionFromCallsign("EGKK_S_GND"),
    ];
    expect(uncoveredPositionSlots(known, online)).toEqual([]);
  });
});

describe("formatPositionSlotLabel", () => {
  it("formats generic and sector labels", () => {
    expect(formatPositionSlotLabel("EGKK", { facilityType: "GND", infix: null })).toBe("GND");
    expect(formatPositionSlotLabel("EGKK", { facilityType: "GND", infix: "N" })).toBe("EGKK_N_GND");
  });
});
