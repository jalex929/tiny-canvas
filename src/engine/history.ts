import {
  DEFAULT_BACKGROUND,
  DEFAULT_SIZE,
  type Action,
  type CanvasSize,
  type History,
  type Stroke,
} from "./types";

export function createHistory(past: Action[] = [], size: CanvasSize = DEFAULT_SIZE): History {
  return { size, past, future: [] };
}

/** Adds an action. Any redo branch is discarded, as in every editor people know. */
export function commit(history: History, action: Action): History {
  if (!isMeaningful(history, action)) return history;
  return { ...history, past: [...history.past, action], future: [] };
}

export function undo(history: History): History {
  const last = history.past[history.past.length - 1];
  if (!last) return history;
  return { ...history, past: history.past.slice(0, -1), future: [last, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { ...history, past: [...history.past, next], future: rest };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

/**
 * A stroke as it sits on the current canvas. `dx`/`dy` move it when the canvas shape has
 * changed since it was drawn; `width`/`height` are the canvas it was drawn on, which is
 * where its symmetry center was.
 */
export interface PlacedStroke {
  stroke: Stroke;
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export interface Scene {
  background: string;
  width: number;
  height: number;
  strokes: PlacedStroke[];
}

/** Replays actions into what should be on screen. */
export function sceneFrom(actions: readonly Action[], size: CanvasSize = DEFAULT_SIZE): Scene {
  let background = DEFAULT_BACKGROUND;
  let { width, height } = size;
  let strokes: PlacedStroke[] = [];
  for (const action of actions) {
    switch (action.type) {
      case "stroke":
        strokes.push({ stroke: action.stroke, dx: 0, dy: 0, width, height });
        break;
      case "clear":
        strokes = [];
        break;
      case "background":
        background = action.color;
        break;
      case "canvas": {
        // Grow or shrink evenly on all sides, so the drawing stays centered.
        const shiftX = (action.width - width) / 2;
        const shiftY = (action.height - height) / 2;
        strokes = strokes.map((s) => ({ ...s, dx: s.dx + shiftX, dy: s.dy + shiftY }));
        width = action.width;
        height = action.height;
        break;
      }
    }
  }
  return { background, width, height, strokes };
}

/**
 * Filters out actions that would add an undo step with no visible change, so a person
 * never presses Undo and sees nothing happen.
 */
function isMeaningful(history: History, action: Action): boolean {
  const scene = sceneFrom(history.past, history.size);
  switch (action.type) {
    case "stroke":
      return action.stroke.points.length > 0;
    case "clear":
      return scene.strokes.length > 0;
    case "background":
      return action.color.toLowerCase() !== scene.background.toLowerCase();
    case "canvas":
      return action.width !== scene.width || action.height !== scene.height;
  }
}
