import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "../engine/history";
import { randomSeed } from "../engine/random";
import { drawStroke, drawStrokes, type RenderTarget } from "../engine/render";
import { symmetryGuides } from "../engine/symmetry";
import { DOC_HEIGHT, DOC_WIDTH, type Point, type Stroke } from "../engine/types";
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

interface Props {
  scene: Scene;
  template: StrokeTemplate;
  onCommit: (stroke: Stroke) => void;
  onAnnounce: (message: string) => void;
}

interface Layers {
  display: CanvasRenderingContext2D;
  cache: CanvasRenderingContext2D;
  scratch: CanvasRenderingContext2D;
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

let strokeCounter = 0;
const newStrokeId = () => `${Date.now().toString(36)}-${(strokeCounter++).toString(36)}`;

export function CanvasStage({ scene, template, onCommit, onAnnounce }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<Layers | null>(null);
  const dprRef = useRef(1);
  const drawnRef = useRef<Stroke[]>([]);
  const liveRef = useRef<LiveStroke | null>(null);
  const frameRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture | null>(null);
  /** After a two-finger gesture, ignore touches until every finger has lifted. */
  const suppressTouchRef = useRef(false);

  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const stageSizeRef = useRef(stage);
  const [view, setViewState] = useState<View>({ s: 0, x: 0, y: 0 });
  const viewRef = useRef(view);
  const cacheViewRef = useRef<View | null>(null);
  const [handMode, setHandMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [keyCursor, setKeyCursor] = useState({ x: DOC_WIDTH / 2, y: DOC_HEIGHT / 2 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [penDown, setPenDown] = useState(false);

  const templateRef = useRef(template);
  templateRef.current = template;
  const strokesRef = useRef(scene.strokes);
  strokesRef.current = scene.strokes;

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  /**
   * Composites the frame: the cached finished strokes (stretched to the current view if
   * a zoom is still settling), then the stroke being drawn, clipped to the paper.
   */
  const paintFrame = useCallback(() => {
    frameRef.current = 0;
    const layers = layersRef.current;
    if (!layers) return;
    const ctx = layers.display;
    const v = viewRef.current;
    const dpr = dprRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x * dpr, v.y * dpr, DOC_WIDTH * v.s * dpr, DOC_HEIGHT * v.s * dpr);
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
      drawStroke(targetFor(ctx, v, dpr), live.stroke, targetFor(layers.scratch, v, dpr));
    }
    ctx.restore();
  }, []);

  const requestFrame = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintFrame);
  }, [paintFrame]);

  /** Re-renders every finished stroke at the current view. Used on zoom, resize and undo. */
  const rebuildCache = useCallback(
    (strokes: Stroke[]) => {
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
    const previous = stageSizeRef.current;
    stageSizeRef.current = stage;
    setView(viewRef.current.s > 0 ? resizeView(viewRef.current, previous, stage) : fitView(stage));
    if (!display || !cache || !scratch) return;
    layersRef.current = { display, cache, scratch };
    rebuildCache(strokesRef.current);
  }, [stage, rebuildCache, setView]);

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
    const appendedOne =
      next.length === previous.length + 1 && previous.every((stroke, i) => next[i] === stroke);
    const layers = layersRef.current;
    const cv = cacheViewRef.current;
    if (appendedOne && layers && cv && sameView(cv, viewRef.current)) {
      const dpr = dprRef.current;
      drawStroke(
        targetFor(layers.cache, cv, dpr),
        next[next.length - 1]!,
        targetFor(layers.scratch, cv, dpr),
      );
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
      setView(zoomAt(viewRef.current, factor, point.x, point.y, size));
    },
    [setView],
  );
  const fit = useCallback(() => setView(fitView(stageSizeRef.current)), [setView]);

  // Zoom shortcuts work anywhere on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
      else if (event.key === "-" || event.key === "_") zoomBy(1 / ZOOM_STEP);
      else if (event.key === "f" || event.key === "F") fit();
      else if (event.key === "h" || event.key === "H") setHandMode((v) => !v);
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
        setView(panBy(viewRef.current, -px, -py, stageSizeRef.current));
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

  const begin = (point: Point, pointerId: number | "keyboard") => {
    liveRef.current = {
      pointerId,
      startedAt: performance.now(),
      stroke: { ...templateRef.current, id: newStrokeId(), seed: randomSeed(), points: [point] },
    };
    requestFrame();
  };

  const extend = (point: Point) => {
    const live = liveRef.current;
    if (!live) return;
    const last = live.stroke.points[live.stroke.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_DISTANCE) return;
    live.stroke.points.push(point);
    requestFrame();
  };

  const finish = (keep: boolean) => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live && keep) onCommit(live.stroke);
    requestFrame();
  };

  const pressureOf = (event: PointerEvent | React.PointerEvent) =>
    event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5;

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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, point);
      if (touchesRef.current.size >= 2) {
        // A second finger means zoom/pan. A stroke that only just started was the first
        // finger of the pinch, so drop it; an established stroke is kept.
        const live = liveRef.current;
        if (live && live.pointerId !== "keyboard") {
          finish(performance.now() - live.startedAt > PINCH_GRACE_MS);
        }
        gestureRef.current = null;
        suppressTouchRef.current = true;
        startPinch();
        return;
      }
      if (suppressTouchRef.current) return;
    }

    const wantsPan =
      event.button === 1 || (handMode && (event.button === 0 || event.pointerType === "touch"));
    if (wantsPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = { kind: "pan", pointerId: event.pointerId, last: point };
      setPanning(true);
      return;
    }
    if (liveRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    begin({ ...toDoc(event), p: pressureOf(event) }, event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = local(event);
    if (event.pointerType !== "touch") setHover(point);
    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, point);
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
        ),
      );
      gesture.last = point;
      return;
    }

    const live = liveRef.current;
    if (!live || live.pointerId !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      extend({ ...toDoc(sample), p: pressureOf(sample) });
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") {
      touchesRef.current.delete(event.pointerId);
      if (gestureRef.current?.kind === "pinch" && touchesRef.current.size < 2) {
        gestureRef.current = null;
      }
      if (touchesRef.current.size === 0) suppressTouchRef.current = false;
    }
    const gesture = gestureRef.current;
    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId) {
      gestureRef.current = null;
      setPanning(false);
    }
    if (liveRef.current?.pointerId === event.pointerId) finish(true);
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
        x: clamp(keyCursor.x + move[0], 0, DOC_WIDTH),
        y: clamp(keyCursor.y + move[1], 0, DOC_HEIGHT),
      };
      setKeyCursor(next);
      setView(ensureVisible(viewRef.current, next.x, next.y, stageSizeRef.current));
      if (penDown) extend({ ...next, p: 0.5 });
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
        begin({ ...keyCursor, p: 0.5 }, "keyboard");
        setPenDown(true);
        onAnnounce(`Drawing from ${describe(keyCursor)}. Use arrow keys, then Space to finish.`);
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

  // ---- Render -----------------------------------------------------------------------------

  const ready = view.s > 0;
  const zoomPercent = ready ? Math.round(zoomOf(view, stage) * 100) : 100;
  const ringSize = template.size * view.s;
  const toStage = (p: { x: number; y: number }) => ({
    left: view.x + p.x * view.s,
    top: view.y + p.y * view.s,
  });
  const isEmpty = scene.strokes.length === 0;
  const guides = symmetryGuides(template.symmetry);

  return (
    <div className="stage" ref={stageRef}>
      {ready && (
        <div
          className="stage__paper"
          style={{
            left: view.x,
            top: view.y,
            width: DOC_WIDTH * view.s,
            height: DOC_HEIGHT * view.s,
            background: scene.background,
          }}
        >
          {isEmpty && (
            <p className="stage__empty" aria-hidden="true">
              <span>Draw anywhere.</span> Pick a brush and a color, then make a mess.
            </p>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`stage__canvas ${handMode ? "is-hand" : ""} ${panning ? "is-panning" : ""}`}
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
          viewBox={`0 0 ${DOC_WIDTH} ${DOC_HEIGHT}`}
          preserveAspectRatio="none"
          style={{
            left: view.x,
            top: view.y,
            width: DOC_WIDTH * view.s,
            height: DOC_HEIGHT * view.s,
          }}
        >
          {guides.map((angle) => {
            const r = DOC_WIDTH;
            const cx = DOC_WIDTH / 2;
            const cy = DOC_HEIGHT / 2;
            const dx = Math.cos(angle) * r;
            const dy = Math.sin(angle) * r;
            return (
              <g key={angle}>
                <line className="guide-under" x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />
                <line className="guide-over" x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />
              </g>
            );
          })}
        </svg>
      )}
      {hover && !keyboardActive && !handMode && !panning && (
        <span
          className="stage__ring"
          aria-hidden="true"
          style={{ left: hover.x, top: hover.y, width: ringSize, height: ringSize }}
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

      <p id="canvas-keyboard-help" className="visually-hidden">
        Arrow keys move the drawing cursor; hold Shift to move faster. Press Space to start a line
        and Space again to finish it. Escape cancels the line in progress. Plus and minus zoom, F
        fits the drawing to the screen.
      </p>
    </div>
  );
}

/** Device-pixel render target for a view. */
function targetFor(ctx: CanvasRenderingContext2D, v: View, dpr: number): RenderTarget {
  return { ctx, scale: v.s * dpr, originX: v.x * dpr, originY: v.y * dpr };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function describe(p: { x: number; y: number }) {
  return `${Math.round((p.x / DOC_WIDTH) * 100)}% across, ${Math.round((p.y / DOC_HEIGHT) * 100)}% down`;
}
