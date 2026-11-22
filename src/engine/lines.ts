import type { Point } from "./types";

export const LINE_MODES = ["any", "horizontal", "vertical", "rising", "falling"] as const;
export type LineMode = (typeof LINE_MODES)[number];

export const LINE_MODE_INFO: Record<LineMode, { label: string; symbol: string }> = {
  any: { label: "Any angle", symbol: "∠" },
  horizontal: { label: "Horizontal", symbol: "—" },
  vertical: { label: "Vertical", symbol: "|" },
  rising: { label: "45° up", symbol: "╱" },
  falling: { label: "45° down", symbol: "╲" },
};

/** Within this many degrees of a horizontal, vertical or 45° line, "any" snaps to it. */
export const SNAP_DEGREES = 6;

/** Where a straight line from `start` should end, given where the pointer is. */
export function constrainLine(
  start: Point,
  pointer: Point,
  mode: LineMode,
  snap = true,
): { x: number; y: number } {
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  switch (mode) {
    case "horizontal":
      return { x: pointer.x, y: start.y };
    case "vertical":
      return { x: start.x, y: pointer.y };
    case "falling": {
      // Screen y grows downward, so "falling" (╲) is direction (1, 1).
      const t = (dx + dy) / 2;
      return { x: start.x + t, y: start.y + t };
    }
    case "rising": {
      const t = (dx - dy) / 2;
      return { x: start.x + t, y: start.y - t };
    }
    case "any": {
      if (!snap || (dx === 0 && dy === 0)) return { x: pointer.x, y: pointer.y };
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 4;
      const nearest = Math.round(angle / step) * step;
      if (Math.abs(angle - nearest) > (SNAP_DEGREES * Math.PI) / 180) {
        return { x: pointer.x, y: pointer.y };
      }
      const length = Math.hypot(dx, dy) * Math.cos(angle - nearest);
      return {
        x: start.x + Math.round(Math.cos(nearest) * length * 1000) / 1000,
        y: start.y + Math.round(Math.sin(nearest) * length * 1000) / 1000,
      };
    }
  }
}

/**
 * The points of a straight stroke. Evenly spaced so textured brushes (spray, hearts,
 * threads) look the same along a line as along a freehand stroke.
 */
export function linePoints(start: Point, end: { x: number; y: number }, spacing = 4): Point[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(length / spacing));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: start.x + ((end.x - start.x) * i) / steps,
    y: start.y + ((end.y - start.y) * i) / steps,
    p: start.p,
  }));
}
