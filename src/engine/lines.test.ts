import { describe, expect, it } from "vitest";
import { constrainLine, linePoints } from "./lines";

const start = { x: 100, y: 100, p: 0.5 };
const at = (x: number, y: number) => ({ x, y, p: 0.5 });

describe("constrainLine", () => {
  it("locks to horizontal and vertical", () => {
    expect(constrainLine(start, at(300, 170), "horizontal")).toEqual({ x: 300, y: 100 });
    expect(constrainLine(start, at(160, 400), "vertical")).toEqual({ x: 100, y: 400 });
  });

  it("locks to the two 45° diagonals", () => {
    // ╲ goes right and down together
    expect(constrainLine(start, at(200, 220), "falling")).toEqual({ x: 210, y: 210 });
    // ╱ goes right and up together
    expect(constrainLine(start, at(200, 20), "rising")).toEqual({ x: 190, y: 10 });
    // and works backwards too
    expect(constrainLine(start, at(0, 0), "falling")).toEqual({ x: 0, y: 0 });
  });

  it("any angle follows the pointer, but snaps when close to 0/45/90°", () => {
    expect(constrainLine(start, at(300, 230), "any")).toEqual({ x: 300, y: 230 });
    const nearlyFlat = constrainLine(start, at(300, 110), "any"); // ~2.9° off horizontal
    expect(nearlyFlat.y).toBe(100);
    const nearlyDiagonal = constrainLine(start, at(300, 290), "any"); // ~1.5° off 45°
    expect(nearlyDiagonal.x - start.x).toBeCloseTo(nearlyDiagonal.y - start.y, 6);
    expect(constrainLine(start, at(300, 110), "any", false)).toEqual({ x: 300, y: 110 });
  });
});

describe("linePoints", () => {
  it("spaces points evenly from start to end with the start pressure", () => {
    const pts = linePoints({ x: 0, y: 0, p: 0.8 }, { x: 10, y: 0 }, 4);
    expect(pts.map((p) => p.x)).toEqual([0, 10 / 3, 20 / 3, 10]);
    expect(pts.every((p) => p.p === 0.8 && p.y === 0)).toBe(true);
  });

  it("returns a dot for a zero-length line", () => {
    expect(linePoints(start, { x: 100, y: 100 })).toHaveLength(2);
  });
});
