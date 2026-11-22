import { describe, expect, it } from "vitest";
import { decodeRuns, dilate, encodeRuns, floodMask, maskArea } from "./fill";
import { SHAPE_KINDS, shapePoints } from "./shapes";

describe("shapes", () => {
  const bounds = (pts: { x: number; y: number }[]) => ({
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  });

  it.each(SHAPE_KINDS)("%s fits the dragged box and closes", (kind) => {
    const pts = shapePoints(kind, { x: 100, y: 100 }, { x: 300, y: 260 });
    const b = bounds(pts);
    expect(b.minX).toBeGreaterThanOrEqual(99.5);
    expect(b.maxX).toBeLessThanOrEqual(300.5);
    expect(b.minY).toBeGreaterThanOrEqual(99.5);
    expect(b.maxY).toBeLessThanOrEqual(260.5);
    expect(b.maxX - b.minX).toBeGreaterThan(150); // actually uses the box
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1);
  });

  it("Shift keeps proportions; Alt draws from the center", () => {
    const square = bounds(
      shapePoints("rectangle", { x: 0, y: 0 }, { x: 200, y: 50 }, { square: true }),
    );
    expect(square.maxX - square.minX).toBeCloseTo(square.maxY - square.minY);
    const centered = bounds(
      shapePoints("ellipse", { x: 500, y: 500 }, { x: 600, y: 550 }, { fromCenter: true }),
    );
    expect((centered.minX + centered.maxX) / 2).toBeCloseTo(500, 0);
    expect(centered.maxX - centered.minX).toBeCloseTo(200, 0);
  });

  it("returns nothing for a tap without a drag", () => {
    expect(shapePoints("star", { x: 10, y: 10 }, { x: 11, y: 10 })).toEqual([]);
  });

  it("spaces outline points evenly so textured brushes look even", () => {
    const pts = shapePoints("rectangle", { x: 0, y: 0 }, { x: 400, y: 400 });
    for (let i = 1; i < pts.length; i++) {
      const gap = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(gap).toBeLessThanOrEqual(4.01);
    }
  });
});

/** A 10×6 white image with a black vertical line at x = 4. */
function picture() {
  const width = 10;
  const height = 6;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) data.fill(0, (y * width + 4) * 4, (y * width + 4) * 4 + 3);
  return { width, height, data };
}

describe("fill", () => {
  it("fills the connected area and stops at lines", () => {
    const img = picture();
    const mask = floodMask(img, 1, 1, 10);
    expect(Array.from(mask).filter(Boolean)).toHaveLength(4 * 6); // columns 0–3
    expect(mask[5]).toBe(0); // right of the line
  });

  it("filling the line itself recolors just the line", () => {
    const mask = floodMask(picture(), 4, 2, 10);
    expect(Array.from(mask).filter(Boolean)).toHaveLength(6);
  });

  it("tolerance lets near colors join the fill", () => {
    const img = picture();
    img.data.fill(230, (2 * 10 + 4) * 4, (2 * 10 + 4) * 4 + 3); // one pale pixel in the line
    expect(floodMask(img, 1, 1, 10)[2 * 10 + 4]).toBe(0);
    expect(floodMask(img, 1, 1, 40)[2 * 10 + 4]).toBe(1);
  });

  it("grows by a pixel to tuck under line edges", () => {
    const grown = dilate(floodMask(picture(), 1, 1, 10), 10, 6, 1);
    expect(grown[4]).toBe(1);
    expect(grown[5]).toBe(0);
  });

  it("round-trips through run encoding", () => {
    const mask = floodMask(picture(), 8, 3, 10);
    const encoded = encodeRuns(mask, 10, 6);
    expect(encoded.runs).toHaveLength(6 * 3); // one run per row
    expect(maskArea(encoded)).toBe(5 * 6);
    expect(Array.from(decodeRuns(encoded))).toEqual(Array.from(mask));
  });

  it("ignores taps outside the picture", () => {
    expect(Array.from(floodMask(picture(), -1, 2, 10)).some(Boolean)).toBe(false);
  });
});
