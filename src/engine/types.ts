/**
 * Core data model for Tiny Canvas.
 *
 * The source of truth is a list of actions (strokes, clears, background changes) in
 * document coordinates. Pixels are always derived from that list, never stored as the
 * truth. That is what makes undo/redo, resizing, re-opening saved work and export at
 * any resolution reliable.
 */

/** Logical document size. All points are stored in this space (4:3). */
export const DOC_WIDTH = 1600;
export const DOC_HEIGHT = 1200;

export const BRUSH_IDS = [
  "pen",
  "marker",
  "pencil",
  "spray",
  "calligraphy",
  "neon",
  "rainbow",
  "sparkle",
  "threads",
  "eraser",
] as const;
export type BrushId = (typeof BRUSH_IDS)[number];

export const SYMMETRY_MODES = ["none", "mirror", "quad", "radial", "kaleidoscope"] as const;
export type SymmetryMode = (typeof SYMMETRY_MODES)[number];

export interface Point {
  x: number;
  y: number;
  /** Pressure from 0 to 1. Mouse and keyboard input report 0.5. */
  p: number;
}

export interface Stroke {
  id: string;
  brush: BrushId;
  /** Hex color, #rrggbb. */
  color: string;
  /** Brush diameter in document pixels. */
  size: number;
  /** 0.05 to 1, applied to the whole stroke so overlaps inside a stroke don't darken. */
  opacity: number;
  symmetry: SymmetryMode;
  /** Seed for brushes with texture, so a stroke re-renders identically every time. */
  seed: number;
  points: Point[];
}

export type Action =
  { type: "stroke"; stroke: Stroke } | { type: "clear" } | { type: "background"; color: string };

export interface History {
  past: Action[];
  future: Action[];
}

export const DEFAULT_BACKGROUND = "#ffffff";
