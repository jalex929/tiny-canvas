import type { Point } from "./types";

export const SHAPE_KINDS = [
  "rectangle",
  "ellipse",
  "triangle",
  "star",
  "heart",
  "spirograph",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_INFO: Record<ShapeKind, { label: string; canFill: boolean }> = {
  rectangle: { label: "Rectangle", canFill: true },
  ellipse: { label: "Ellipse", canFill: true },
  triangle: { label: "Triangle", canFill: true },
  star: { label: "Star", canFill: true },
  heart: { label: "Heart", canFill: true },
  spirograph: { label: "Spirograph", canFill: false },
};

/** Spirograph: a wheel rolling inside a 96-tooth ring, like the toy. */
export const SPIRO_RING = 96;
export const SPIRO_WHEELS = [24, 30, 36, 40, 45, 52, 60, 63, 72] as const;

export interface ShapeOptions {
  /** Keep proportions: square, circle, regular star (Shift on desktop). */
  square?: boolean;
  /** Drag from the center instead of a corner (Alt on desktop). */
  fromCenter?: boolean;
  /** Spirograph wheel teeth (one of SPIRO_WHEELS). */
  wheel?: number;
  /** Spirograph pen hole: 0 = wheel center, 1 = wheel rim. */
  hole?: number;
}

/** Spacing between generated points, in document px, so textured brushes look even. */
const STEP = 4;

/**
 * Points for a shape dragged from `a` to `b`. Closed shapes end where they start.
 * Returns [] while the drag is too small to show anything.
 */
export function shapePoints(
  kind: ShapeKind,
  a: { x: number; y: number },
  b: { x: number; y: number },
  options: ShapeOptions = {},
): Point[] {
  let w = b.x - a.x;
  let h = b.y - a.y;
  if (options.square) {
    const side = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * side;
    h = Math.sign(h || 1) * side;
  }
  // Box: center and half-sizes.
  const cx = options.fromCenter ? a.x : a.x + w / 2;
  const cy = options.fromCenter ? a.y : a.y + h / 2;
  const rx = options.fromCenter ? Math.abs(w) : Math.abs(w) / 2;
  const ry = options.fromCenter ? Math.abs(h) : Math.abs(h) / 2;
  if (rx < 2 && ry < 2) return [];

  const unit = (fn: (t: number) => { x: number; y: number }, samples: number) =>
    Array.from({ length: samples + 1 }, (_, i) => {
      const p = fn(i / samples);
      return { x: cx + p.x * rx, y: cy + p.y * ry, p: 1 };
    });

  switch (kind) {
    case "rectangle":
      return polygon(
        [
          { x: cx - rx, y: cy - ry },
          { x: cx + rx, y: cy - ry },
          { x: cx + rx, y: cy + ry },
          { x: cx - rx, y: cy + ry },
        ],
        true,
      );
    case "triangle":
      return polygon(
        [
          { x: cx, y: cy - ry },
          { x: cx + rx, y: cy + ry },
          { x: cx - rx, y: cy + ry },
        ],
        true,
      );
    case "star":
      return polygon(
        Array.from({ length: 10 }, (_, i) => {
          const angle = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? 1 : 0.42;
          return { x: cx + Math.cos(angle) * rx * r, y: cy + Math.sin(angle) * ry * r };
        }),
        true,
      );
    case "ellipse": {
      const around = Math.PI * (rx + ry);
      return unit(
        (t) => ({ x: Math.cos(t * Math.PI * 2), y: Math.sin(t * Math.PI * 2) }),
        Math.max(24, Math.ceil(around / STEP)),
      );
    }
    case "heart": {
      // Classic heart curve, scaled to fill the box (raw x in ±16, y from -12 to 17).
      const around = Math.PI * (rx + ry) * 1.3;
      return unit(
        (t) => {
          const s = t * Math.PI * 2;
          const x = 16 * Math.sin(s) ** 3;
          const y = -(
            13 * Math.cos(s) -
            5 * Math.cos(2 * s) -
            2 * Math.cos(3 * s) -
            Math.cos(4 * s)
          );
          return { x: x / 16, y: (y - 2.5) / 14.5 };
        },
        Math.max(40, Math.ceil(around / STEP)),
      );
    }
    case "spirograph":
      return spirograph(cx, cy, rx, ry, options.wheel ?? 52, options.hole ?? 0.75);
  }
}

/** How many loops a spirograph wheel draws: the curve closes after wheel/gcd turns. */
export function spiroLoops(wheel: number): number {
  return SPIRO_RING / gcd(SPIRO_RING, wheel);
}

/**
 * Hypotrochoid: a wheel with `wheel` teeth rolls inside the ring; the pen sits `hole`
 * of the way from the wheel's center to its rim. Scaled so the whole figure fits the box.
 */
function spirograph(cx: number, cy: number, rx: number, ry: number, wheel: number, hole: number) {
  const R = SPIRO_RING;
  const r = Math.min(Math.max(wheel, 1), R - 1);
  const d = r * Math.min(Math.max(hole, 0), 1);
  const turns = r / gcd(R, r);
  const extent = R - r + d;
  const loops = spiroLoops(r);
  const samples = Math.min(6000, Math.max(200, loops * 90, Math.ceil((turns * (rx + ry)) / 2)));
  const total = Math.PI * 2 * turns;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = (i / samples) * total;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    return { x: cx + (x / extent) * rx, y: cy + (y / extent) * ry, p: 1 };
  });
}

/** Evenly spaced points around a polygon (closed: back to the first corner). */
function polygon(corners: { x: number; y: number }[], closed: boolean): Point[] {
  const out: Point[] = [];
  const path = closed ? [...corners, corners[0]!] : corners;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1]!;
    const q = path[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / STEP));
    for (let k = 0; k < steps; k++) {
      out.push({ x: p.x + ((q.x - p.x) * k) / steps, y: p.y + ((q.y - p.y) * k) / steps, p: 1 });
    }
  }
  const last = path[path.length - 1]!;
  out.push({ x: last.x, y: last.y, p: 1 });
  return out;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
