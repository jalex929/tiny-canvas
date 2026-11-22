import { DEFAULT_BACKGROUND, type Action, type History, type Stroke } from "./types";

export function createHistory(past: Action[] = []): History {
  return { past, future: [] };
}

/** Adds an action. Any redo branch is discarded, as in every editor people know. */
export function commit(history: History, action: Action): History {
  if (!isMeaningful(history, action)) return history;
  return { past: [...history.past, action], future: [] };
}

export function undo(history: History): History {
  const last = history.past[history.past.length - 1];
  if (!last) return history;
  return { past: history.past.slice(0, -1), future: [last, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, next], future: rest };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

export interface Scene {
  background: string;
  strokes: Stroke[];
}

/** Replays actions into what should be on screen. */
export function sceneFrom(actions: readonly Action[]): Scene {
  let background = DEFAULT_BACKGROUND;
  let strokes: Stroke[] = [];
  for (const action of actions) {
    if (action.type === "stroke") strokes.push(action.stroke);
    else if (action.type === "clear") strokes = [];
    else background = action.color;
  }
  return { background, strokes };
}

/**
 * Filters out actions that would add an undo step with no visible change, so a person
 * never presses Undo and sees nothing happen.
 */
function isMeaningful(history: History, action: Action): boolean {
  const scene = sceneFrom(history.past);
  switch (action.type) {
    case "stroke":
      return action.stroke.points.length > 0;
    case "clear":
      return scene.strokes.length > 0;
    case "background":
      return action.color.toLowerCase() !== scene.background.toLowerCase();
  }
}
