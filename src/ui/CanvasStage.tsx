import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "../engine/history";
import { randomSeed } from "../engine/random";
import { drawStroke, drawStrokes, type RenderTarget } from "../engine/render";
import { DOC_HEIGHT, DOC_WIDTH, type Point, type Stroke } from "../engine/types";

export type StrokeTemplate = Omit<Stroke, "id" | "seed" | "points">;

interface Props {
  scene: Scene;
  template: StrokeTemplate;
  onCommit: (stroke: Stroke) => void;
  onAnnounce: (message: string) => void;
}

interface Layers {
  display: RenderTarget;
  cache: RenderTarget;
  scratch: RenderTarget;
}

const KEY_STEP = 10;
const KEY_STEP_FAST = 50;
/** Ignore pointer samples closer than this (document px); keeps strokes light. */
const MIN_SAMPLE_DISTANCE = 0.75;

let strokeCounter = 0;
const newStrokeId = () => `${Date.now().toString(36)}-${(strokeCounter++).toString(36)}`;

export function CanvasStage({ scene, template, onCommit, onAnnounce }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<Layers | null>(null);
  const drawnRef = useRef<Stroke[]>([]);
  const liveRef = useRef<{ stroke: Stroke; pointerId: number | "keyboard" } | null>(null);
  const frameRef = useRef(0);
  const [cssSize, setCssSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [keyCursor, setKeyCursor] = useState({ x: DOC_WIDTH / 2, y: DOC_HEIGHT / 2 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [penDown, setPenDown] = useState(false);

  const templateRef = useRef(template);
  templateRef.current = template;
  const strokesRef = useRef(scene.strokes);
  strokesRef.current = scene.strokes;

  /** Draws the cached finished strokes plus whatever is being drawn right now. */
  const paintFrame = useCallback(() => {
    frameRef.current = 0;
    const layers = layersRef.current;
    if (!layers) return;
    const { ctx } = layers.display;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(layers.cache.ctx.canvas, 0, 0);
    const live = liveRef.current;
    if (live) drawStroke(layers.display, live.stroke, layers.scratch);
  }, []);

  const requestFrame = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintFrame);
  }, [paintFrame]);

  /** Re-renders every finished stroke into the cache. Used on resize and undo. */
  const rebuildCache = useCallback(
    (strokes: Stroke[]) => {
      drawnRef.current = strokes;
      const layers = layersRef.current;
      if (!layers) return;
      const { ctx } = layers.cache;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawStrokes(layers.cache, strokes, layers.scratch);
      requestFrame();
    },
    [requestFrame],
  );

  // Fit a 4:3 canvas into the available space, at device pixel density.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const fitWidth = Math.max(1, Math.min(width, (height * DOC_WIDTH) / DOC_HEIGHT));
      setCssSize({ width: fitWidth, height: (fitWidth * DOC_HEIGHT) / DOC_WIDTH });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssSize.width === 0) return;
    // Cap density so a huge 4K window doesn't allocate enormous layers.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.round(cssSize.width * dpr);
    const height = Math.round(cssSize.height * dpr);
    const scale = width / DOC_WIDTH;
    canvas.width = width;
    canvas.height = height;
    const make = (): RenderTarget | null => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d");
      return ctx ? { ctx, scale } : null;
    };
    const display = canvas.getContext("2d");
    const cache = make();
    const scratch = make();
    if (!display || !cache || !scratch) return;
    layersRef.current = { display: { ctx: display, scale }, cache, scratch };
    rebuildCache(strokesRef.current);
  }, [cssSize, rebuildCache]);

  // When the scene changes, add just the new stroke if possible; otherwise rebuild.
  useEffect(() => {
    const previous = drawnRef.current;
    const next = scene.strokes;
    if (next === previous) return;
    const appendedOne =
      next.length === previous.length + 1 && previous.every((stroke, i) => next[i] === stroke);
    const layers = layersRef.current;
    if (appendedOne && layers) {
      drawStroke(layers.cache, next[next.length - 1]!, layers.scratch);
      drawnRef.current = next;
      requestFrame();
    } else {
      rebuildCache(next);
    }
  }, [scene.strokes, rebuildCache, requestFrame]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const toDoc = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * DOC_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * DOC_HEIGHT,
    };
  };

  const begin = (point: Point, pointerId: number | "keyboard") => {
    liveRef.current = {
      pointerId,
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (liveRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    begin({ ...toDoc(event), p: pressureOf(event) }, event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "touch") setHover(toDoc(event));
    const live = liveRef.current;
    if (!live || live.pointerId !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      extend({ ...toDoc(sample), p: pressureOf(sample) });
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
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

  const ringSize = (template.size / DOC_WIDTH) * cssSize.width;
  const position = (p: { x: number; y: number }) => ({
    left: `${(p.x / DOC_WIDTH) * 100}%`,
    top: `${(p.y / DOC_HEIGHT) * 100}%`,
  });
  const isEmpty = scene.strokes.length === 0;

  return (
    <div className="stage" ref={wrapRef}>
      <div
        className="stage__sheet"
        style={{ width: cssSize.width, height: cssSize.height, background: scene.background }}
      >
        <canvas
          ref={canvasRef}
          className="stage__canvas"
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
        {hover && !keyboardActive && (
          <span
            className="stage__ring"
            aria-hidden="true"
            style={{ ...position(hover), width: ringSize, height: ringSize }}
          />
        )}
        {keyboardActive && (
          <span
            className={`stage__cursor ${penDown ? "is-down" : ""}`}
            aria-hidden="true"
            style={{
              ...position(keyCursor),
              width: Math.max(ringSize, 18),
              height: Math.max(ringSize, 18),
            }}
          />
        )}
        {isEmpty && (
          <p className="stage__empty" aria-hidden="true">
            <span>Draw anywhere.</span> Pick a brush and a color, then make a mess.
          </p>
        )}
      </div>
      <p id="canvas-keyboard-help" className="visually-hidden">
        Arrow keys move the drawing cursor; hold Shift to move faster. Press Space to start a line
        and Space again to finish it. Escape cancels the line in progress.
      </p>
    </div>
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function describe(p: { x: number; y: number }) {
  return `${Math.round((p.x / DOC_WIDTH) * 100)}% across, ${Math.round((p.y / DOC_HEIGHT) * 100)}% down`;
}
