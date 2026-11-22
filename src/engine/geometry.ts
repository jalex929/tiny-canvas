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

/**
 * Width multiplier for a stored pressure. 1 (mouse, finger, keyboard, or a full press) is the
 * full brush size; the lightest stylus touch is 15% of it.
 */
export const pressureScale = (p: number) => 0.15 + 0.85 * p;

/** Dash and gap lengths for a line style, scaled to the brush so gaps stay in proportion. */
export function dashPattern(style: "dashed" | "dotted", size: number) {
  return style === "dashed"
    ? { dash: Math.max(8, size * 2.5), gap: Math.max(6, size * 1.6) }
    : { dash: 0, gap: Math.max(6, size * 1.8) };
}

/**
 * Cuts a stroke into the visible pieces of a dashed (or dotted) line. Dots are one-point
 * pieces, which every brush paints as a single mark.
 */
export function dashPieces(points: readonly Point[], dash: number, gap: number): Point[][] {
  // Dots: one mark at exactly every `gap` along the line.
  if (dash <= 0) return resample(points, gap).map((point) => [point]);
  const step = Math.max(0.5, Math.min(2, dash / 4));
  const samples = resample(points, step);
  const period = dash + gap;
  const pieces: Point[][] = [];
  let current: Point[] | null = null;
  samples.forEach((point, i) => {
    const along = (i * step) % period;
    const on = along < dash;
    if (on) {
      if (!current) {
        current = [];
        pieces.push(current);
      }
      current.push(point);
    } else {
      current = null;
    }
  });
  return pieces;
}
