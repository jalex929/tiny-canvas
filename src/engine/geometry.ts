import type { Point } from "./types";

export interface Segment {
  from: Point;
  ctrl: Point;
  to: Point;
}

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  p: (a.p + b.p) / 2,
});

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Midpoint smoothing: the curve passes through the midpoints between samples and
 * bends toward the samples themselves. Removes the jagged look of raw pointer input
 * without lagging behind the pointer.
 */
export function smoothSegments(points: readonly Point[]): Segment[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return [];
  const segments: Segment[] = [];
  let from = first;
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]!;
    const to = midpoint(current, points[i + 1]!);
    segments.push({ from, ctrl: current, to });
    from = to;
  }
  segments.push({ from, ctrl: midpoint(from, last), to: last });
  return segments;
}

/** Points spaced evenly along the polyline, with pressure interpolated. */
export function resample(points: readonly Point[], spacing: number): Point[] {
  const first = points[0];
  if (!first) return [];
  const out: Point[] = [first];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = distance(a, b);
    if (length === 0) continue;
    let along = spacing - carry;
    while (along <= length) {
      const t = along / length;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t });
      along += spacing;
    }
    carry = length - (along - spacing);
  }
  return out;
}

/** Pressure 0.5 (mouse, keyboard) means 1×; a stylus ranges from 0.5× to 1.5×. */
export const pressureScale = (p: number) => 0.5 + p;
