import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlacedStroke, Scene } from "../engine/history";
import { constrainLine, linePoints } from "../engine/lines";
import { shapePressure, smoothPressure, type PressureCurve } from "../engine/pressure";
import { randomSeed } from "../engine/random";
import { pullBrush, smoothingRadius, type SmoothingLevel } from "../engine/stabilizer";
import {
  compositeLayer,
  drawPlaced,
  drawStrokes,
  paintStrokeRange,
  type RenderTarget,
} from "../engine/render";
import { SHAPE_INFO, shapePoints, type ShapeKind } from "../engine/shapes";
import { symmetryGuideLines } from "../engine/symmetry";
import type { Point, Stroke } from "../engine/types";
import {
  ensureVisible,
  fitView,
  panBy,
  pinchView,
  resizeView,
  sameView,
  screenToDoc,
  zoomAt,
  zoomOf,
  type Size,
  type View,
} from "../engine/viewport";
import { Icon } from "./Icon";
import { shouldIgnoreShortcut } from "./keyboard";

export type StrokeTemplate = Omit<Stroke, "id" | "seed" | "points">;

export interface ShapeSettings {
  kind: ShapeKind;
  filled: boolean;
  wheel: number;
  hole: number;
}

interface Props {
  scene: Scene;
  template: StrokeTemplate;
  showGuides: boolean;
  pressureCurve: PressureCurve;
  /** Steadies freehand lines (lazy brush). */
  smoothing: SmoothingLevel;
  /** What a press on the canvas does. */
  tool: "brush" | "shape" | "fill";
  shape: ShapeSettings;
  /** Fill tool: fill the area at this document point. */
  onFill: (point: { x: number; y: number }) => void;
  /** Briefly shows the true brush size in the middle of the canvas (while it changes). */
  showSizePreview: boolean;
  /** Phone layout: pinch replaces zoom buttons, and the Line button is icon-only. */
  compact: boolean;
  /** A tool sheet is open: hide floating controls and hints so the small canvas stays clear. */
  quiet: boolean;
  /** When a stylus is in use, fingers only move and zoom (palm rejection). */
  penOnly: boolean;
  onPenDetected: () => void;
  /** When armed, the next tap picks a color instead of drawing. */
  eyedropper: boolean;
  onPickColor: (hex: string) => void;
  /** Two-finger tap and three-finger tap (the drawing-app convention). */
  onUndoGesture: () => void;
  onRedoGesture: () => void;
  onCommit: (stroke: Stroke) => void;
  onAnnounce: (message: string) => void;
}

interface Layers {
  display: CanvasRenderingContext2D;
  /** Finished strokes, rendered at `cacheView`. */
  cache: CanvasRenderingContext2D;
  scratch: CanvasRenderingContext2D;
  /** The stroke in progress: the settled part, painted once… */
  liveStable: CanvasRenderingContext2D;
  /** …plus its still-changing tip, repainted each frame. */
  liveWork: CanvasRenderingContext2D;
}

type Gesture =
  | {
      kind: "pinch";
      startView: View;
      startMid: { x: number; y: number };
      startDistance: number;
    }
  | { kind: "pan"; pointerId: number; last: { x: number; y: number } };

interface LiveStroke {
  stroke: Stroke;
  pointerId: number | "keyboard";
  startedAt: number;
  /** Where a straight line starts: the last freehand point… */
  anchor: Point;
  /** …and its index, so a line replaces only what comes after it. */
  anchorIndex: number;
  lastPressure?: number;
  /** Where the smoothed brush is, and where the pointer really is (for the final catch-up). */
  brush: { x: number; y: number };
  lastRaw?: { x: number; y: number; p: number };
  /** Units already painted onto the stable live layer. */
  painted: number;
  /** The view the live layers were painted at; a change means repaint from scratch. */
  liveView: View | null;
  /** Set when points were replaced rather than added (straight-line mode). */
  reset: boolean;
  /** Shape tool: where the drag started. */
  shapeStart?: Point;
}

const KEY_STEP = 10;
const KEY_STEP_FAST = 50;
/** Ignore pointer samples closer than this (document px); keeps strokes light. */
const MIN_SAMPLE_DISTANCE = 0.75;
/** A one-finger stroke this young is treated as the start of a pinch, and dropped. */
const PINCH_GRACE_MS = 300;
/** Re-render crisply this long after zooming or panning stops. */
const SETTLE_MS = 140;
const ZOOM_STEP = 1.25;
/**
 * The last couple of units of a stroke can still change as points arrive (a curve's last
 * segment bends toward the next point), so they're repainted each frame, not settled.
 */
const UNSETTLED_UNITS = 2;
/** A press on the Line button shorter than this toggles it on/off instead of holding. */
const TAP_MS = 250;

let strokeCounter = 0;
const newStrokeId = () => `${Date.now().toString(36)}-${(strokeCounter++).toString(36)}`;

export function CanvasStage({
  scene,
  template,
  showGuides,
  pressureCurve,
  smoothing,
  tool,
  shape,
  onFill,
  showSizePreview,
  compact,
  quiet,
  penOnly,
  onPenDetected,
  eyedropper,
  onPickColor,
  onUndoGesture,
  onRedoGesture,
  onCommit,
  onAnnounce,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<Layers | null>(null);
  const dprRef = useRef(1);
  const drawnRef = useRef<PlacedStroke[]>([]);
  const liveRef = useRef<LiveStroke | null>(null);
  /** A just-finished stroke whose live layer can be copied straight into the cache. */
  const pendingCommitRef = useRef<{ id: string; view: View } | null>(null);
  const frameRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture | null>(null);
  /** After a two-finger gesture, ignore touches until every finger has lifted. */
  const suppressTouchRef = useRef(false);
  /** A multi-finger touch that might turn out to be a tap (undo/redo) rather than a pinch. */
  const tapRef = useRef<{
    startedAt: number;
    fingers: number;
    moved: boolean;
    startView: View;
    starts: Map<number, { x: number; y: number }>;
  } | null>(null);

  const doc: Size = { width: scene.width, height: scene.height };
  const docRef = useRef(doc);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const stageSizeRef = useRef(stage);
  const [view, setViewState] = useState<View>({ s: 0, x: 0, y: 0 });
  const viewRef = useRef(view);
  const cacheViewRef = useRef<View | null>(null);
  const [handMode, setHandMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [keyCursor, setKeyCursor] = useState({ x: scene.width / 2, y: scene.height / 2 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [penDown, setPenDown] = useState(false);

  // Straight lines: Shift (desktop), holding the Line button, or the Line button locked on.
  // Lines go at any angle, snapping to flat, upright or 45° when close.
  const [lineLocked, setLineLocked] = useState(false);
  const [lineHeld, setLineHeld] = useState(false);
  const lineButtonDown = useRef<{ at: number; usedForLine: boolean } | null>(null);
  const lineRef = useRef({ active: false });
  lineRef.current = { active: lineLocked || lineHeld };

  const templateRef = useRef(template);
  templateRef.current = template;
  const pressureRef = useRef({ curve: pressureCurve, penOnly, smoothing });
  pressureRef.current = { curve: pressureCurve, penOnly, smoothing };
  const strokesRef = useRef(scene.strokes);
  strokesRef.current = scene.strokes;

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  /** Composites the frame: cached strokes (stretched while a zoom settles) + live stroke. */
  const paintFrame = useCallback(() => {
    frameRef.current = 0;
    const layers = layersRef.current;
    if (!layers) return;
    const ctx = layers.display;
    const v = viewRef.current;
    const dpr = dprRef.current;
    const d = docRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x * dpr, v.y * dpr, d.width * v.s * dpr, d.height * v.s * dpr);
    ctx.clip();
    const cv = cacheViewRef.current;
    if (cv) {
      const k = v.s / cv.s;
      ctx.setTransform(k, 0, 0, k, (v.x - k * cv.x) * dpr, (v.y - k * cv.y) * dpr);
      ctx.drawImage(layers.cache.canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const live = liveRef.current;
    if (live) {
      updateLiveLayers(layers, live, v, dpr, d);
      compositeLayer(ctx, layers.liveWork.canvas, live.stroke);
    }
    ctx.restore();
  }, []);

  const requestFrame = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintFrame);
  }, [paintFrame]);

  /** Re-renders every finished stroke at the current view. Used on zoom, resize and undo. */
  const rebuildCache = useCallback(
    (strokes: PlacedStroke[]) => {
      drawnRef.current = strokes;
      const layers = layersRef.current;
      if (!layers) return;
      const v = viewRef.current;
      const dpr = dprRef.current;
      const ctx = layers.cache;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawStrokes(targetFor(ctx, v, dpr), strokes, targetFor(layers.scratch, v, dpr));
      cacheViewRef.current = v;
      requestFrame();
    },
    [requestFrame],
  );

  // Track the stage size.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStage({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Size the layers to the stage, keep the view stable, re-render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage.width <= 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    dprRef.current = dpr;
    const width = Math.round(stage.width * dpr);
    const height = Math.round(stage.height * dpr);
    canvas.width = width;
    canvas.height = height;
    const make = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      return c.getContext("2d");
    };
    const display = canvas.getContext("2d");
    const cache = make();
    const scratch = make();
    const liveStable = make();
    const liveWork = make();
    const previous = stageSizeRef.current;
    stageSizeRef.current = stage;
    setView(
      viewRef.current.s > 0
        ? resizeView(viewRef.current, previous, stage, docRef.current)
        : fitView(stage, docRef.current),
    );
    if (!display || !cache || !scratch || !liveStable || !liveWork) return;
    layersRef.current = { display, cache, scratch, liveStable, liveWork };
    if (liveRef.current) liveRef.current.reset = true;
    rebuildCache(strokesRef.current);
  }, [stage, rebuildCache, setView]);

  // A different canvas shape (or another drawing): fit it to the screen.
  useEffect(() => {
    const changed = docRef.current.width !== scene.width || docRef.current.height !== scene.height;
    docRef.current = { width: scene.width, height: scene.height };
    if (!changed || stageSizeRef.current.width <= 1) return;
    setView(fitView(stageSizeRef.current, docRef.current));
    setKeyCursor({ x: scene.width / 2, y: scene.height / 2 });
  }, [scene.width, scene.height, setView]);

  // When the view moves: show it immediately (stretched), then re-render crisply.
  useEffect(() => {
    requestFrame();
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const cv = cacheViewRef.current;
      if (!cv || !sameView(cv, viewRef.current)) rebuildCache(drawnRef.current);
    }, SETTLE_MS);
  }, [view, requestFrame, rebuildCache]);

  // When the drawing changes, add just the new stroke if possible; otherwise rebuild.
  useEffect(() => {
    const previous = drawnRef.current;
    const next = scene.strokes;
    if (next === previous) return;
    const same = (a: PlacedStroke, b: PlacedStroke | undefined) =>
      !!b && a.stroke === b.stroke && a.dx === b.dx && a.dy === b.dy;
    const appendedOne =
      next.length === previous.length + 1 && previous.every((p, i) => same(p, next[i]));
    const layers = layersRef.current;
    const cv = cacheViewRef.current;
    const pending = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (appendedOne && layers && cv && sameView(cv, viewRef.current)) {
      const dpr = dprRef.current;
      const added = next[next.length - 1]!;
      if (
        pending &&
        pending.id === added.stroke.id &&
        sameView(pending.view, cv) &&
        added.dx === 0 &&
        added.dy === 0
      ) {
        // The live layer already holds exactly this stroke: copy it, don't redraw it.
        compositeLayer(layers.cache, layers.liveWork.canvas, added.stroke);
      } else {
        drawPlaced(targetFor(layers.cache, cv, dpr), added, targetFor(layers.scratch, cv, dpr));
      }
      drawnRef.current = next;
      requestFrame();
    } else {
      rebuildCache(next);
    }
  }, [scene.strokes, rebuildCache, requestFrame]);

  useEffect(
    () => () => {
      // Reset the id too: React's dev double-mount would otherwise leave it "pending"
      // forever and no frame would ever be scheduled again.
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    [],
  );

  // ---- Zoom helpers ----------------------------------------------------------------------

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      const size = stageSizeRef.current;
      const point = at ?? { x: size.width / 2, y: size.height / 2 };
      setView(zoomAt(viewRef.current, factor, point.x, point.y, size, docRef.current));
    },
    [setView],
  );
  const fit = useCallback(() => setView(fitView(stageSizeRef.current, docRef.current)), [setView]);

  // Zoom and line shortcuts work anywhere on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
      else if (event.key === "-" || event.key === "_") zoomBy(1 / ZOOM_STEP);
      else if (event.key === "f" || event.key === "F") fit();
      else if (event.key === "h" || event.key === "H") setHandMode((v) => !v);
      else if (event.key === "l" || event.key === "L") setLineLocked((v) => !v);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, fit]);

  // Wheel: pinch on a trackpad (or Ctrl + wheel) zooms, plain scrolling pans.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      const rect = canvas.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinches send small deltas, mouse wheels big ones; cap each step.
        const step = Math.max(-40, Math.min(40, dy));
        zoomBy(Math.exp(-step * 0.01), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        const [px, py] = event.shiftKey && !dx ? [dy, 0] : [dx, dy];
        setView(panBy(viewRef.current, -px, -py, stageSizeRef.current, docRef.current));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomBy, setView]);

  // ---- Drawing --------------------------------------------------------------------------

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toDoc = (event: { clientX: number; clientY: number }) => {
    const p = local(event);
    return screenToDoc(viewRef.current, p.x, p.y);
  };

  const begin = (
    point: Point,
    pointerId: number | "keyboard",
    overrides: Partial<StrokeTemplate> = {},
  ) => {
    liveRef.current = {
      pointerId,
      startedAt: performance.now(),
      anchor: point,
      anchorIndex: 0,
      lastPressure: point.p,
      brush: { x: point.x, y: point.y },
      painted: 0,
      liveView: null,
      reset: true,
      stroke: {
        ...templateRef.current,
        ...overrides,
        id: newStrokeId(),
        seed: randomSeed(),
        points: [point],
      },
    };
    requestFrame();
  };

  /** Adds a point; in line mode, redraws the stroke as a straight line to it instead. */
  const extend = (point: Point, straight: boolean) => {
    const live = liveRef.current;
    if (!live) return;
    if (straight) {
      if (lineButtonDown.current) lineButtonDown.current.usedForLine = true;
      const end = constrainLine(live.anchor, point, "any");
      // Keep any freehand part drawn before the line started.
      const before = live.stroke.points.slice(0, live.anchorIndex);
      live.stroke.points = [...before, ...linePoints(live.anchor, end)];
      live.reset = true;
      requestFrame();
      return;
    }
    const last = live.stroke.points[live.stroke.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_DISTANCE) return;
    live.stroke.points.push(point);
    // Freehand moves the anchor along, so a line started mid-stroke begins from here.
    live.anchor = point;
    live.anchorIndex = live.stroke.points.length - 1;
    requestFrame();
  };

  const finish = (keep: boolean) => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live && keep) {
      const layers = layersRef.current;
      if (layers) {
        // Paint the very end now, so the live layer is the complete stroke.
        const v = viewRef.current;
        updateLiveLayers(layers, live, v, dprRef.current, docRef.current);
        pendingCommitRef.current = { id: live.stroke.id, view: v };
      }
      onCommit(live.stroke);
    }
    requestFrame();
  };

  /** Stored pressure: real stylus pressure through the chosen curve, otherwise full. */
  const pressureOf = (event: PointerEvent | React.PointerEvent, previous?: number) => {
    if (event.pointerType !== "pen" || !(event.pressure > 0)) return 1;
    return smoothPressure(previous, shapePressure(event.pressure, pressureRef.current.curve));
  };

  /**
   * Reads the color under a point: the drawing if there is ink there, otherwise the paper.
   * Partly see-through ink is blended over the paper, so you get the color you see.
   */
  const sampleColor = (point: { x: number; y: number }): string => {
    const layers = layersRef.current;
    const dpr = dprRef.current;
    if (!layers) return scene.background;
    const [r, g, b, a] = layers.display.getImageData(
      Math.floor(point.x * dpr),
      Math.floor(point.y * dpr),
      1,
      1,
    ).data as unknown as [number, number, number, number];
    const bg = parseInt(scene.background.slice(1), 16);
    const mix = (ink: number, paper: number) => Math.round((ink * a) / 255 + paper * (1 - a / 255));
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex(mix(r, (bg >> 16) & 255))}${hex(mix(g, (bg >> 8) & 255))}${hex(mix(b, bg & 255))}`;
  };

  const startPinch = () => {
    const [a, b] = [...touchesRef.current.values()];
    if (!a || !b) return;
    gestureRef.current = {
      kind: "pinch",
      startView: viewRef.current,
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startDistance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  };

  const startPan = (
    event: React.PointerEvent<HTMLCanvasElement>,
    point: { x: number; y: number },
  ) => {
    event.preventDefault();
    capture(event);
    gestureRef.current = { kind: "pan", pointerId: event.pointerId, last: point };
    setPanning(true);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    if (event.pointerType === "pen") onPenDetected();
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, point);
      if (touchesRef.current.size >= 2) {
        const tap = tapRef.current;
        if (!tap) {
          tapRef.current = {
            startedAt: performance.now(),
            fingers: touchesRef.current.size,
            moved: false,
            startView: viewRef.current,
            starts: new Map(touchesRef.current),
          };
        } else {
          tap.fingers = Math.max(tap.fingers, touchesRef.current.size);
          tap.starts.set(event.pointerId, point);
        }
        // A second finger means zoom/pan. A stroke that only just started was the first
        // finger of the pinch, so drop it; an established stroke is kept.
        const live = liveRef.current;
        if (live && live.pointerId !== "keyboard") {
          finish(performance.now() - live.startedAt > PINCH_GRACE_MS);
        }
        gestureRef.current = null;
        setPanning(false);
        suppressTouchRef.current = true;
        startPinch();
        return;
      }
      if (suppressTouchRef.current) return;
      // Palm rejection: with a stylus in use, a finger moves the view instead of drawing.
      if (pressureRef.current.penOnly) {
        startPan(event, point);
        return;
      }
    }

    if (event.button === 1 || (handMode && (event.button === 0 || event.pointerType === "touch"))) {
      startPan(event, point);
      return;
    }
    if (liveRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    // Eyedropper: armed from the Color panel, or Alt + click on desktop.
    if (eyedropper || (event.altKey && event.pointerType !== "touch")) {
      event.preventDefault();
      onPickColor(sampleColor(point));
      return;
    }
    event.preventDefault();
    if (tool === "fill") {
      onFill(toDoc(event));
      return;
    }
    capture(event);
    if (tool === "shape") {
      const start = { ...toDoc(event), p: 1 };
      // Filled shapes are solid color; outlines use the current brush.
      const filled = shape.filled && SHAPE_INFO[shape.kind].canFill;
      begin(start, event.pointerId, filled ? { brush: "fill", options: {} } : {});
      liveRef.current!.shapeStart = start;
      return;
    }
    begin({ ...toDoc(event), p: pressureOf(event) }, event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    if (event.pointerType !== "touch") setHover(point);
    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, point);
      const tap = tapRef.current;
      const start = tap?.starts.get(event.pointerId);
      if (tap && start && Math.hypot(point.x - start.x, point.y - start.y) > 14) tap.moved = true;
    }

    const gesture = gestureRef.current;
    if (gesture?.kind === "pinch") {
      const [a, b] = [...touchesRef.current.values()];
      if (a && b) {
        setView(
          pinchView(
            gesture.startView,
            gesture.startMid,
            gesture.startDistance,
            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            Math.hypot(a.x - b.x, a.y - b.y),
            stageSizeRef.current,
            docRef.current,
          ),
        );
      }
      return;
    }
    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId) {
      setView(
        panBy(
          viewRef.current,
          point.x - gesture.last.x,
          point.y - gesture.last.y,
          stageSizeRef.current,
          docRef.current,
        ),
      );
      gesture.last = point;
      return;
    }

    const live = liveRef.current;
    if (!live || live.pointerId !== event.pointerId) return;
    if (live.shapeStart) {
      const points = shapePoints(shape.kind, live.shapeStart, toDoc(event), {
        square: event.shiftKey,
        fromCenter: event.altKey,
        wheel: shape.wheel,
        hole: shape.hole,
      });
      live.stroke.points = points.length ? points : [live.shapeStart];
      live.reset = true;
      requestFrame();
      return;
    }
    if (event.shiftKey || lineRef.current.active) {
      extend({ ...toDoc(event), p: live.anchor.p }, true);
      return;
    }
    // String length is set in screen pixels, so smoothing feels the same at any zoom.
    const radius = smoothingRadius(pressureRef.current.smoothing) / viewRef.current.s;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const p = pressureOf(sample, live.lastPressure);
      live.lastPressure = p;
      const raw = toDoc(sample);
      live.lastRaw = { ...raw, p };
      const next = pullBrush(live.brush, raw, radius);
      if (!next) continue;
      live.brush = next;
      extend({ ...next, p }, false);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") {
      touchesRef.current.delete(event.pointerId);
      if (gestureRef.current?.kind === "pinch" && touchesRef.current.size < 2) {
        gestureRef.current = null;
      }
      if (touchesRef.current.size === 0) {
        suppressTouchRef.current = false;
        const tap = tapRef.current;
        tapRef.current = null;
        // Quick multi-finger tap that didn't move: undo (2 fingers) or redo (3).
        if (tap && !tap.moved && performance.now() - tap.startedAt < 350) {
          setView(tap.startView);
          if (tap.fingers === 2) onUndoGesture();
          else if (tap.fingers >= 3) onRedoGesture();
        }
      }
    }
    const gesture = gestureRef.current;
    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId) {
      gestureRef.current = null;
      setPanning(false);
    }
    const live = liveRef.current;
    if (live?.pointerId === event.pointerId && live.shapeStart) {
      // A tap without a drag makes no shape.
      finish(live.stroke.points.length >= 3);
      return;
    }
    if (live?.pointerId === event.pointerId) {
      // Smoothing trails the pointer; finish the line where it was lifted.
      if (live.lastRaw && !event.shiftKey && !lineRef.current.active) {
        extend(live.lastRaw, false);
      }
      finish(true);
    }
  };

  // Keyboard drawing: an accessible alternative to pointer input.
  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setKeyboardActive(true);
      const next = {
        x: clamp(keyCursor.x + move[0], 0, scene.width),
        y: clamp(keyCursor.y + move[1], 0, scene.height),
      };
      setKeyCursor(next);
      setView(ensureVisible(viewRef.current, next.x, next.y, stageSizeRef.current, docRef.current));
      if (penDown) extend({ ...next, p: 1 }, false);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setKeyboardActive(true);
      if (penDown) {
        finish(true);
        setPenDown(false);
        onAnnounce("Line finished.");
      } else {
        begin({ ...keyCursor, p: 1 }, "keyboard");
        setPenDown(true);
        onAnnounce(
          `Drawing from ${describe(keyCursor, scene)}. Use arrow keys, then Space to finish.`,
        );
      }
      return;
    }
    if (event.key === "Escape" && liveRef.current) {
      event.preventDefault();
      finish(false);
      setPenDown(false);
      onAnnounce("Line cancelled.");
    }
  };

  const onBlur = () => {
    if (liveRef.current?.pointerId === "keyboard") {
      finish(true);
      setPenDown(false);
    }
    setKeyboardActive(false);
  };

  // ---- Line button: hold for straight lines, or tap to lock it on ---------------------------

  const onLineDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    capture(event);
    lineButtonDown.current = { at: performance.now(), usedForLine: false };
    setLineHeld(true);
  };
  const onLineUp = () => {
    const down = lineButtonDown.current;
    lineButtonDown.current = null;
    setLineHeld(false);
    if (down && !down.usedForLine && performance.now() - down.at < TAP_MS) {
      const next = !lineLocked;
      setLineLocked(next);
      onAnnounce(next ? "Straight lines on." : "Straight lines off.");
    }
  };

  // ---- Render -----------------------------------------------------------------------------

  const ready = view.s > 0;
  const zoomPercent = ready ? Math.round(zoomOf(view, stage, doc) * 100) : 100;
  const ringSize = template.size * view.s;
  const toStage = (p: { x: number; y: number }) => ({
    left: view.x + p.x * view.s,
    top: view.y + p.y * view.s,
  });
  const isEmpty = scene.strokes.length === 0;
  const guides = showGuides
    ? symmetryGuideLines(template.symmetry, template.symmetryCount, scene.width, scene.height)
    : [];
  const lineOn = lineLocked || lineHeld;

  return (
    <div className="stage" ref={stageRef}>
      {ready && (
        <div
          className="stage__paper"
          style={{
            left: view.x,
            top: view.y,
            width: scene.width * view.s,
            height: scene.height * view.s,
            background: scene.background,
          }}
        >
          {isEmpty && !quiet && (
            <p className="stage__empty" aria-hidden="true">
              <span>Draw anywhere.</span> Pick a brush and a color, then make a mess.
            </p>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`stage__canvas ${handMode ? "is-hand" : ""} ${panning ? "is-panning" : ""} ${
          eyedropper ? "is-eyedropper" : ""
        } is-tool-${tool}`}
        data-testid="drawing-canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="drawing canvas"
        aria-label="Drawing canvas"
        aria-describedby="canvas-keyboard-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onContextMenu={(e) => e.preventDefault()}
      />
      {ready && guides.length > 0 && (
        <svg
          className="stage__guides"
          aria-hidden="true"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          preserveAspectRatio="none"
          style={{
            left: view.x,
            top: view.y,
            width: scene.width * view.s,
            height: scene.height * view.s,
          }}
        >
          {guides.map((line, i) => (
            <g key={i}>
              <line className="guide-under" {...line} />
              <line className="guide-over" {...line} />
            </g>
          ))}
        </svg>
      )}
      {hover && !keyboardActive && !handMode && !panning && !eyedropper && tool !== "fill" && (
        <span
          className="stage__ring"
          aria-hidden="true"
          style={{ left: hover.x, top: hover.y, width: ringSize, height: ringSize }}
        />
      )}
      {showSizePreview && ready && (
        <span
          className="stage__size-preview"
          aria-hidden="true"
          style={{
            left: stage.width / 2,
            top: stage.height / 2,
            width: Math.max(4, ringSize),
            height: Math.max(4, ringSize),
            background: template.brush === "eraser" ? "transparent" : template.color,
            opacity: template.brush === "eraser" ? 1 : Math.max(0.35, template.opacity),
          }}
        />
      )}
      {keyboardActive && (
        <span
          className={`stage__cursor ${penDown ? "is-down" : ""}`}
          aria-hidden="true"
          style={{
            ...toStage(keyCursor),
            width: Math.max(ringSize, 18),
            height: Math.max(ringSize, 18),
          }}
        />
      )}

      <div
        className={`line-tool ${compact ? "line-tool--compact" : ""}`}
        hidden={quiet || tool !== "brush"}
      >
        <button
          type="button"
          className={`line-tool__button ${lineOn ? "is-on" : ""}`}
          aria-pressed={lineLocked}
          aria-label="Straight lines. Hold while drawing, or tap to keep on."
          title="Hold while drawing, or tap to keep on (L). With a mouse, hold Shift."
          onPointerDown={onLineDown}
          onPointerUp={onLineUp}
          onPointerCancel={onLineUp}
          onClick={(e) => {
            // Keyboard activation (pointer presses are handled above).
            if (e.detail === 0) {
              setLineLocked((v) => !v);
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Icon name="line" />
          <span className="line-tool__label">{lineOn ? "Line on" : "Line"}</span>
        </button>
      </div>

      {compact ? (
        // Phones zoom with a pinch; just offer a way back to the whole drawing.
        zoomPercent > 100 &&
        !quiet && (
          <button
            type="button"
            className="zoom-fit"
            onClick={fit}
            aria-label="Fit drawing to screen"
          >
            Fit · {zoomPercent}%
          </button>
        )
      ) : (
        <div className="zoom" role="group" aria-label="Zoom and pan">
          <button
            type="button"
            className="zoom__button"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={zoomPercent <= 100}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className="zoom__level"
            onClick={fit}
            aria-label={`Zoom ${zoomPercent}%. Fit to screen`}
            title="Fit to screen (F)"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="zoom__button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={zoomPercent >= 800}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="zoom__button zoom__hand"
            onClick={() => setHandMode((v) => !v)}
            aria-pressed={handMode}
            aria-label="Hand tool: drag to move around"
            title="Hand tool (H)"
          >
            <Icon name="hand" />
          </button>
        </div>
      )}

      <p id="canvas-keyboard-help" className="visually-hidden">
        Arrow keys move the drawing cursor; hold Shift to move faster. Press Space to start a line
        and Space again to finish it. Escape cancels the line in progress. Plus and minus zoom, F
        fits the drawing to the screen, L turns straight lines on and off.
      </p>
    </div>
  );
}

/** Pointer capture keeps a stroke going if the pointer leaves the canvas. Some browsers throw
 * for pointers they consider inactive; drawing still works without it. */
function capture(event: React.PointerEvent<Element>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    /* not essential */
  }
}

/**
 * Brings the live layers up to date: settles every unit that can no longer change onto the
 * stable layer (painted once), then repaints just the moving tip on top. Drawing cost per
 * frame stays small however long the stroke gets.
 */
function updateLiveLayers(
  layers: Layers,
  live: LiveStroke,
  v: View,
  dpr: number,
  doc: { width: number; height: number },
) {
  const frame = { dx: 0, dy: 0, width: doc.width, height: doc.height };
  const stable = layers.liveStable;
  const work = layers.liveWork;
  if (live.reset || !live.liveView || !sameView(live.liveView, v)) {
    stable.setTransform(1, 0, 0, 1, 0, 0);
    stable.clearRect(0, 0, stable.canvas.width, stable.canvas.height);
    live.painted = 0;
    live.reset = false;
    live.liveView = v;
  }
  const stableTarget = targetFor(stable, v, dpr);
  const total = paintStrokeRange(stableTarget, live.stroke, frame, live.painted, live.painted);
  const settled = Math.max(live.painted, total - UNSETTLED_UNITS);
  if (settled > live.painted) {
    paintStrokeRange(stableTarget, live.stroke, frame, live.painted, settled);
    live.painted = settled;
  }
  work.setTransform(1, 0, 0, 1, 0, 0);
  work.globalAlpha = 1;
  work.globalCompositeOperation = "source-over";
  work.clearRect(0, 0, work.canvas.width, work.canvas.height);
  work.drawImage(stable.canvas, 0, 0);
  paintStrokeRange(targetFor(work, v, dpr), live.stroke, frame, live.painted, Infinity);
}

/** Device-pixel render target for a view. */
function targetFor(ctx: CanvasRenderingContext2D, v: View, dpr: number): RenderTarget {
  return { ctx, scale: v.s * dpr, originX: v.x * dpr, originY: v.y * dpr };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function describe(p: { x: number; y: number }, size: { width: number; height: number }) {
  return `${Math.round((p.x / size.width) * 100)}% across, ${Math.round((p.y / size.height) * 100)}% down`;
}
