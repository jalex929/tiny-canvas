/**
 * How the document sits on screen.
 * `s` is CSS pixels per document pixel; `x`/`y` is where the document's top-left corner is,
 * in CSS pixels from the stage's top-left corner.
 */
export interface View {
  s: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Zoom is relative to "fit": 1 = the whole drawing fits on screen. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** Breathing room around the paper, in CSS px. */
export const MARGIN = 12;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function fitScale(stage: Size, doc: Size): number {
  return Math.max(
    1e-4,
    Math.min((stage.width - 2 * MARGIN) / doc.width, (stage.height - 2 * MARGIN) / doc.height),
  );
}

export function fitView(stage: Size, doc: Size): View {
  const s = fitScale(stage, doc);
  return { s, x: (stage.width - doc.width * s) / 2, y: (stage.height - doc.height * s) / 2 };
}

export function zoomOf(view: View, stage: Size, doc: Size): number {
  return view.s / fitScale(stage, doc);
}

/**
 * Keeps zoom in range and the paper on screen. When the paper is smaller than the stage
 * in a direction it is centered; when it is bigger its edges can't be dragged past the
 * stage edges (plus the margin), so you can never lose the drawing.
 */
export function clampView(view: View, stage: Size, doc: Size): View {
  const fit = fitScale(stage, doc);
  const s = clamp(view.s, fit * MIN_ZOOM, fit * MAX_ZOOM);
  const axis = (pos: number, length: number, room: number) =>
    length + 2 * MARGIN <= room ? (room - length) / 2 : clamp(pos, room - length - MARGIN, MARGIN);
  return {
    s,
    x: axis(view.x, doc.width * s, stage.width),
    y: axis(view.y, doc.height * s, stage.height),
  };
}

/** Zooms by `factor`, keeping the document point under (px, py) where it is. */
export function zoomAt(
  view: View,
  factor: number,
  px: number,
  py: number,
  stage: Size,
  doc: Size,
): View {
  const fit = fitScale(stage, doc);
  const s = clamp(view.s * factor, fit * MIN_ZOOM, fit * MAX_ZOOM);
  const point = screenToDoc(view, px, py);
  return clampView({ s, x: px - point.x * s, y: py - point.y * s }, stage, doc);
}

export function panBy(view: View, dx: number, dy: number, stage: Size, doc: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, stage, doc);
}

export function screenToDoc(view: View, px: number, py: number) {
  return { x: (px - view.x) / view.s, y: (py - view.y) / view.s };
}

export function docToScreen(view: View, dx: number, dy: number) {
  return { x: view.x + dx * view.s, y: view.y + dy * view.s };
}

/** After the stage changes size, keep the same zoom level and the same point in the middle. */
export function resizeView(view: View, before: Size, after: Size, doc: Size): View {
  if (before.width <= 0 || before.height <= 0) return fitView(after, doc);
  const zoom = zoomOf(view, before, doc);
  const center = screenToDoc(view, before.width / 2, before.height / 2);
  const s = fitScale(after, doc) * zoom;
  return clampView(
    { s, x: after.width / 2 - center.x * s, y: after.height / 2 - center.y * s },
    after,
    doc,
  );
}

/** Pans just enough to bring a document point into view (used by keyboard drawing). */
export function ensureVisible(
  view: View,
  dx: number,
  dy: number,
  stage: Size,
  doc: Size,
  pad = 40,
): View {
  const p = docToScreen(view, dx, dy);
  let shiftX = 0;
  let shiftY = 0;
  if (p.x < pad) shiftX = pad - p.x;
  else if (p.x > stage.width - pad) shiftX = stage.width - pad - p.x;
  if (p.y < pad) shiftY = pad - p.y;
  else if (p.y > stage.height - pad) shiftY = stage.height - pad - p.y;
  return shiftX || shiftY ? panBy(view, shiftX, shiftY, stage, doc) : view;
}

/**
 * Two-finger gesture: scale by how far the fingers spread, and keep the document point that
 * was under the starting midpoint under the current midpoint (so pinch also pans).
 */
export function pinchView(
  start: View,
  startMid: { x: number; y: number },
  startDistance: number,
  mid: { x: number; y: number },
  distance: number,
  stage: Size,
  doc: Size,
): View {
  const fit = fitScale(stage, doc);
  const s = clamp(
    start.s * (distance / Math.max(1, startDistance)),
    fit * MIN_ZOOM,
    fit * MAX_ZOOM,
  );
  const point = screenToDoc(start, startMid.x, startMid.y);
  return clampView({ s, x: mid.x - point.x * s, y: mid.y - point.y * s }, stage, doc);
}

export const sameView = (a: View, b: View) => a.s === b.s && a.x === b.x && a.y === b.y;
