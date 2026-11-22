import { describe, expect, it } from "vitest";
import { pressureScale } from "./geometry";
import { shapePressure, smoothPressure } from "./pressure";

describe("pen pressure", () => {
  it("full pressure (and mouse/finger) draws the full brush size; a feather touch is thin", () => {
    expect(pressureScale(1)).toBe(1);
    expect(pressureScale(0)).toBeCloseTo(0.15);
  });

  it("curves change how quickly lines get thick", () => {
    const light = 0.3;
    expect(shapePressure(light, "soft")).toBeGreaterThan(shapePressure(light, "normal"));
    expect(shapePressure(light, "normal")).toBeGreaterThan(shapePressure(light, "firm"));
    expect(shapePressure(light, "normal")).toBe(0.3);
    expect(shapePressure(light, "off")).toBe(1);
    expect(shapePressure(1, "firm")).toBe(1);
    expect(shapePressure(-2, "normal")).toBe(0);
  });

  it("smooths jittery readings within a stroke", () => {
    expect(smoothPressure(undefined, 0.8)).toBe(0.8);
    const s = smoothPressure(0.2, 1);
    expect(s).toBeGreaterThan(0.2);
    expect(s).toBeLessThan(1);
  });
});
