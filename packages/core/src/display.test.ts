import { describe, expect, it } from "vitest";
import { displayProbability, MAX_DISPLAY_PROBABILITY } from "./display.js";

describe("displayProbability", () => {
  it("caps at 90%", () => {
    expect(displayProbability(1)).toBe(MAX_DISPLAY_PROBABILITY);
    expect(displayProbability(0.98)).toBe(0.9);
  });

  it("leaves values below the cap unchanged", () => {
    expect(displayProbability(0.75)).toBe(0.75);
    expect(displayProbability(0)).toBe(0);
  });

  it("clamps negative values to zero", () => {
    expect(displayProbability(-0.1)).toBe(0);
  });
});
