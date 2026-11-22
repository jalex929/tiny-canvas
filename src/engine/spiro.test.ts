import { describe, expect, it } from "vitest";
import {
  angleDelta,
  fullPattern,
  penAt,
  spiroArc,
  spiroLoops,
  spiroTurns,
  wheelCenter,
  wheelRadius,
} from "./spiro";

const ring = { x: 800, y: 600, r: 400 };
const gear = { wheel: 52, hole: 0.75 };

describe("spirograph", () => {
  it("gear ratios set loops and trips, like the toy", () => {
    expect(spiroLoops(52)).toBe(24);
    expect(spiroTurns(52)).toBe(13);
    expect(spiroLoops(30)).toBe(16);
    expect(spiroTurns(30)).toBe(5);
  });

  it("the wheel rolls inside the ring, touching it", () => {
    const r = wheelRadius(ring, gear);
    expect(r).toBeCloseTo((400 * 52) / 96);
    for (const angle of [0, 1, 2.5, 4]) {
      const c = wheelCenter(ring, gear, angle);
      expect(Math.hypot(c.x - ring.x, c.y - ring.y) + r).toBeCloseTo(ring.r);
    }
  });

  it("the pen stays inside the ring", () => {
    for (const p of fullPattern(ring, gear)) {
      expect(Math.hypot(p.x - ring.x, p.y - ring.y)).toBeLessThanOrEqual(ring.r + 0.001);
    }
  });

  it("the full pattern closes where it started", () => {
    const pts = fullPattern(ring, gear);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.01);
  });

  it("turning back retraces the same line", () => {
    const forward = spiroArc(ring, gear, 0, 1);
    const back = spiroArc(ring, gear, 1, 0);
    expect(back[back.length - 1]!.x).toBeCloseTo(forward[0]!.x);
    expect(back[0]!.y).toBeCloseTo(forward[forward.length - 1]!.y);
  });

  it("turning in pieces lands exactly where one long turn does", () => {
    const end = penAt(ring, gear, 2.4);
    const pieces = [...spiroArc(ring, gear, 0, 1), ...spiroArc(ring, gear, 1, 2.4)];
    expect(pieces[pieces.length - 1]!.x).toBeCloseTo(end.x);
  });

  it("points are close enough together to look smooth", () => {
    const pts = spiroArc(ring, gear, 0, 3, 3);
    for (let i = 1; i < pts.length; i++) {
      const gap = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(gap).toBeLessThanOrEqual(3.01);
    }
  });

  it("drag angles unwrap across the ±180° seam", () => {
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2);
    expect(angleDelta(-3.1, 3.1)).toBeCloseTo(-(2 * Math.PI - 6.2));
    expect(angleDelta(0.2, 0.5)).toBeCloseTo(0.3);
  });
});
