import { normalizeHex } from "../engine/color";
import {
  BRUSH_IDS,
  DEFAULT_SIZE,
  SYMMETRY_MODES,
  type Action,
  type BrushId,
  type Point,
  type Stroke,
  type SymmetryMode,
} from "../engine/types";

/** Bump when the saved shape changes, and add a migration in parseDrawing. */
export const DRAWING_FORMAT_VERSION = 1;

export interface DrawingSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Small PNG data URL for the "My drawings" shelf. */
  thumbnail: string | null;
}

export interface Drawing extends DrawingSummary {
  /** The canvas size the drawing started at. Canvas actions may change it later. */
  width: number;
  height: number;
  actions: Action[];
}

/** Smallest and largest canvas edge accepted from storage, in document pixels. */
const MIN_EDGE = 200;
const MAX_EDGE = 4000;

/**
 * Where drawings live. The browser (IndexedDB) store is the only one today; an
 * account-backed store can implement the same interface later without touching the UI.
 */
export interface DrawingStore {
  /** Human-readable, shown in the save status. */
  readonly label: string;
  list(): Promise<DrawingSummary[]>;
  get(id: string): Promise<Drawing | null>;
  save(drawing: Drawing): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Validates data read back from storage. Bad actions are dropped, not trusted. */
export function parseDrawing(value: unknown): Drawing | null {
  if (!isRecord(value)) return null;
  const { id, title, createdAt, updatedAt, thumbnail, actions, width, height } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof createdAt !== "number" || typeof updatedAt !== "number") return null;
  if (!Array.isArray(actions)) return null;
  return {
    id,
    title: typeof title === "string" && title.trim() ? title : "Untitled drawing",
    createdAt,
    updatedAt,
    thumbnail: typeof thumbnail === "string" ? thumbnail : null,
    // Drawings saved before canvas shapes existed were all the default size.
    width: isFiniteNumber(width) ? clamp(width, MIN_EDGE, MAX_EDGE) : DEFAULT_SIZE.width,
    height: isFiniteNumber(height) ? clamp(height, MIN_EDGE, MAX_EDGE) : DEFAULT_SIZE.height,
    actions: actions.map(parseAction).filter((a): a is Action => a !== null),
  };
}

export function parseAction(value: unknown): Action | null {
  if (!isRecord(value)) return null;
  if (value.type === "clear") return { type: "clear" };
  if (value.type === "background") {
    const color = typeof value.color === "string" ? normalizeHex(value.color) : null;
    return color ? { type: "background", color } : null;
  }
  if (value.type === "canvas") {
    if (!isFiniteNumber(value.width) || !isFiniteNumber(value.height)) return null;
    return {
      type: "canvas",
      width: clamp(value.width, MIN_EDGE, MAX_EDGE),
      height: clamp(value.height, MIN_EDGE, MAX_EDGE),
    };
  }
  if (value.type === "stroke") {
    const stroke = parseStroke(value.stroke);
    return stroke ? { type: "stroke", stroke } : null;
  }
  return null;
}

function parseStroke(value: unknown): Stroke | null {
  if (!isRecord(value)) return null;
  const { id, brush, color, size, opacity, symmetry, seed, points, options } = value;
  if (typeof id !== "string") return null;
  if (!BRUSH_IDS.includes(brush as BrushId)) return null;
  const hex = typeof color === "string" ? normalizeHex(color) : null;
  if (!hex) return null;
  if (!isFiniteNumber(size) || !isFiniteNumber(opacity) || !isFiniteNumber(seed)) return null;
  if (!Array.isArray(points)) return null;
  const parsed = points.filter(isPoint);
  if (parsed.length === 0) return null;
  return {
    id,
    brush: brush as BrushId,
    color: hex,
    size: clamp(size, 1, 400),
    opacity: clamp(opacity, 0.05, 1),
    symmetry: SYMMETRY_MODES.includes(symmetry as SymmetryMode)
      ? (symmetry as SymmetryMode)
      : "none",
    seed,
    points: parsed,
    ...(isRecord(options) ? { options: numericEntries(options) } : {}),
  };
}

/** Rounds coordinates so saved drawings stay small. 0.01px is far below visible. */
export function compactStroke(stroke: Stroke): Stroke {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...stroke,
    points: stroke.points.map((pt) => ({ x: round(pt.x), y: round(pt.y), p: round(pt.p) })),
  };
}

function numericEntries(record: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => isFiniteNumber(entry[1])),
  );
}

function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.p)
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
