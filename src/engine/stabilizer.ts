/**
 * Line smoothing ("lazy brush"). The brush trails the pointer on a string of fixed length:
 * it only moves when the pointer pulls the string tight, so small hand wobbles never reach
 * the line. Based on distance rather than time, so it feels the same at any speed.
 */
export const SMOOTHING_LEVELS = ["off", "light", "medium", "strong"] as const;
export type SmoothingLevel = (typeof SMOOTHING_LEVELS)[number];

export const SMOOTHING_INFO: Record<SmoothingLevel, { label: string; radius: number }> = {
  off: { label: "Off", radius: 0 },
  light: { label: "Light", radius: 4 },
  medium: { label: "Medium", radius: 10 },
  strong: { label: "Strong", radius: 20 },
};

/** String length in screen pixels; divide by the zoom to get document pixels. */
export const smoothingRadius = (level: SmoothingLevel) => SMOOTHING_INFO[level].radius;

/**
 * Where the brush moves when the pointer is at `pointer`. Returns null when the pointer is
 * still within the string's reach (the brush stays put).
 */
export function pullBrush(
  brush: { x: number; y: number },
  pointer: { x: number; y: number },
  radius: number,
): { x: number; y: number } | null {
  if (radius <= 0) return { x: pointer.x, y: pointer.y };
  const dx = pointer.x - brush.x;
  const dy = pointer.y - brush.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return null;
  const t = (distance - radius) / distance;
  return { x: brush.x + dx * t, y: brush.y + dy * t };
}
