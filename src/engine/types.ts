/**
 * Core data model for Tiny Canvas.
 *
 * The source of truth is a list of actions (strokes, clears, background changes) in
 * document coordinates. Pixels are always derived from that list, never stored as the
 * truth. That is what makes undo/redo, resizing, re-opening saved work and export at
 * any resolution reliable.
 */

/**
 * Default document size (landscape 4:3). Each drawing has its own size, picked from
 * CANVAS_SHAPES; drawings saved before sizes existed use this one.
 */
import type { FillMask } from "./fill";

export const DOC_WIDTH = 1600;
export const DOC_HEIGHT = 1200;

export interface CanvasSize {
  width: number;
  height: number;
}

export const DEFAULT_SIZE: CanvasSize = { width: DOC_WIDTH, height: DOC_HEIGHT };

/** About two megapixels each, so brushes look the same size on every shape. */
export const CANVAS_SHAPES = [
  { id: "square", label: "Square", ratio: "1:1", size: { width: 1400, height: 1400 } },
  { id: "landscape", label: "Landscape", ratio: "4:3", size: { width: 1600, height: 1200 } },
  { id: "portrait", label: "Portrait", ratio: "3:4", size: { width: 1200, height: 1600 } },
  { id: "wide", label: "Wide", ratio: "16:9", size: { width: 1920, height: 1080 } },
  { id: "tall", label: "Tall", ratio: "9:16", size: { width: 1080, height: 1920 } },
] as const;
export type CanvasShapeId = (typeof CANVAS_SHAPES)[number]["id"];

/** Grouped and ordered as they appear in the picker; number keys follow this order. */
export const BRUSH_IDS = [
  "pen",
  "pencil",
  "marker",
  "calligraphy",
  "spray",
  "neon",
  "sparkle",
  "hearts",
  "pattern",
  "rainbow",
  "eraser",
  // Not in the picker: paints fill-tool areas and filled shapes.
  "fill",
  // Retired from the picker (2026-11-22); kept so older drawings still render.
  "threads",
] as const;
export type BrushId = (typeof BRUSH_IDS)[number];

export const BRUSH_GROUPS: { label: string; brushes: BrushId[] }[] = [
  { label: "Draw", brushes: ["pen", "pencil", "marker", "calligraphy"] },
  { label: "Paint & glow", brushes: ["spray", "neon"] },
  { label: "Playful", brushes: ["sparkle", "hearts", "pattern", "rainbow"] },
  { label: "Clean up", brushes: ["eraser"] },
];

export const SYMMETRY_MODES = [
  "none",
  "mirror",
  "quad",
  "radial",
  "kaleidoscope",
  "spiral",
  "tile",
] as const;
export type SymmetryMode = (typeof SYMMETRY_MODES)[number];

export interface Point {
  x: number;
  y: number;
  /** Pressure from 0 to 1 after the pressure curve. Mouse, finger and keyboard store 1. */
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
  /** Brush-specific settings (nib angle, density, spacing…). Missing keys use defaults. */
  options?: Record<string, number>;
  /** Copies for radial, kaleidoscope and spiral symmetry. Missing = 6. */
  symmetryCount?: number;
  /** Fill-tool area at document resolution ("fill" brush only). */
  mask?: FillMask;
}

export type Action =
  | { type: "stroke"; stroke: Stroke }
  | { type: "clear" }
  | { type: "background"; color: string }
  /** Changes the canvas shape. Existing marks stay centered. */
  | { type: "canvas"; width: number; height: number };

export interface History {
  /** The canvas size the drawing started with (canvas actions change it from there). */
  size: CanvasSize;
  past: Action[];
  future: Action[];
}

export const DEFAULT_BACKGROUND = "#ffffff";
