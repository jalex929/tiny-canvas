import type { Point } from "./types";

/**
 * A spirograph like the toy: a toothed wheel rolls around the inside of a fixed ring, and a
 * pen through one of the wheel's holes draws the curve. Angles are the wheel's progress
 * around the ring (radians), so turning the wheel by hand maps straight onto drawing.
 */

/** Teeth on the fixed ring. */
export const SPIRO_RING_TEETH = 96;
/** Wheels you can swap in, by number of teeth. */
export const SPIRO_WHEELS = [24, 30, 36, 40, 45, 52, 60, 63, 72] as const;

export interface SpiroRing {
  /** Center, in document px. */
  x: number;
  y: number;
  /** Inner radius of the ring, in document px. */
  r: number;
}

export interface SpiroGear {
  /** Wheel teeth (one of SPIRO_WHEELS). */
  wheel: number;
  /** Pen hole: 0 = wheel center, 1 = wheel rim. */
  hole: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Loops in the finished pattern: 96 / gcd(96, wheel). 52 teeth → 24 loops. */
export function spiroLoops(wheel: number): number {
  return SPIRO_RING_TEETH / gcd(SPIRO_RING_TEETH, wheel);
}

/** Trips around the ring before the pattern closes: wheel / gcd(96, wheel). */
export function spiroTurns(wheel: number): number {
  return wheel / gcd(SPIRO_RING_TEETH, wheel);
}

/** Radius of the wheel, in document px, for a ring of radius `ringRadius`. */
export function wheelRadius(ring: SpiroRing, gear: SpiroGear): number {
  const teeth = Math.min(Math.max(gear.wheel, 1), SPIRO_RING_TEETH - 1);
  return (ring.r * teeth) / SPIRO_RING_TEETH;
}

/** Where the wheel's center is when it has rolled `angle` radians around the ring. */
export function wheelCenter(ring: SpiroRing, gear: SpiroGear, angle: number) {
  const rolling = ring.r - wheelRadius(ring, gear);
  return { x: ring.x + rolling * Math.cos(angle), y: ring.y + rolling * Math.sin(angle) };
}

/** How far the wheel itself has spun (it turns the other way as it rolls inside). */
export function wheelSpin(ring: SpiroRing, gear: SpiroGear, angle: number): number {
  const r = wheelRadius(ring, gear);
  return (-(ring.r - r) / r) * angle;
}

/** Where the pen is when the wheel has rolled `angle` radians around the ring. */
export function penAt(ring: SpiroRing, gear: SpiroGear, angle: number): Point {
  const c = wheelCenter(ring, gear, angle);
  const d = wheelRadius(ring, gear) * Math.min(Math.max(gear.hole, 0), 1);
  const spin = wheelSpin(ring, gear, angle);
  return { x: c.x + d * Math.cos(spin), y: c.y + d * Math.sin(spin), p: 1 };
}

/**
 * Pen points from angle `from` to `to` (either direction), spaced at most `step` document px
 * apart so the line is smooth and textured brushes look even.
 */
export function spiroArc(
  ring: SpiroRing,
  gear: SpiroGear,
  from: number,
  to: number,
  step = 3,
): Point[] {
  const r = wheelRadius(ring, gear);
  const d = r * gear.hole;
  // Fastest the pen can move per radian of rolling.
  const speed = ring.r - r + (d * (ring.r - r)) / r;
  const count = Math.max(1, Math.ceil((Math.abs(to - from) * speed) / step));
  return Array.from({ length: count + 1 }, (_, i) =>
    penAt(ring, gear, from + ((to - from) * i) / count),
  );
}

/** The whole pattern: enough trips around the ring for the curve to close. */
export function fullPattern(ring: SpiroRing, gear: SpiroGear, start = 0): Point[] {
  return spiroArc(ring, gear, start, start + Math.PI * 2 * spiroTurns(gear.wheel));
}

/** Smallest change from angle `a` to angle `b`, in (-π, π]. Used to turn by dragging. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d <= -Math.PI) d += Math.PI * 2;
  if (d > Math.PI) d -= Math.PI * 2;
  return d;
}
