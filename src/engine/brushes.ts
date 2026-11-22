import { hexToHsl, hslToHex, tint } from "./color";
import { distance, pressureScale, resample, smoothSegments, type Segment } from "./geometry";
import type { BrushId, Point, Stroke } from "./types";

export interface BrushPaint {
  ctx: CanvasRenderingContext2D;
  stroke: Stroke;
  /** Seeded by the stroke, so textured brushes repeat exactly on every re-render. */
  random: () => number;
  /** Device pixels per document pixel. Shadows ignore transforms, so glow needs it. */
  pixelScale: number;
}

export interface BrushDefinition {
  id: BrushId;
  label: string;
  hint: string;
  /** How the finished stroke combines with what is already on the canvas. */
  composite: GlobalCompositeOperation;
  defaultSize: number;
  paint: (brush: BrushPaint) => void;
}

const TAU = Math.PI * 2;

export const BRUSHES: Record<BrushId, BrushDefinition> = {
  pen: {
    id: "pen",
    label: "Pen",
    hint: "Smooth ink that responds to stylus pressure",
    composite: "source-over",
    defaultSize: 10,
    paint: ({ ctx, stroke }) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (paintDot(ctx, stroke, (p) => (stroke.size * pressureScale(p.p)) / 2)) return;
      for (const segment of smoothSegments(stroke.points)) {
        ctx.lineWidth = stroke.size * pressureScale(segment.ctrl.p);
        ctx.beginPath();
        traceSegment(ctx, segment, true);
        ctx.stroke();
      }
    },
  },
  marker: {
    id: "marker",
    label: "Marker",
    hint: "See-through ink that darkens where strokes overlap",
    composite: "multiply",
    defaultSize: 28,
    paint: ({ ctx, stroke }) => {
      ctx.globalAlpha = 0.7;
      strokePath(ctx, stroke, stroke.size, stroke.color);
    },
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    hint: "Grainy graphite texture",
    composite: "source-over",
    defaultSize: 6,
    paint: ({ ctx, stroke, random }) => {
      ctx.fillStyle = stroke.color;
      const grains = Math.max(2, Math.round(stroke.size * 0.8));
      for (const point of resample(stroke.points, 1.5)) {
        const radius = (stroke.size / 2) * pressureScale(point.p);
        for (let i = 0; i < grains; i++) {
          ctx.globalAlpha = 0.12 + random() * 0.4;
          const angle = random() * TAU;
          const r = radius * random();
          ctx.fillRect(point.x + Math.cos(angle) * r, point.y + Math.sin(angle) * r, 1.3, 1.3);
        }
      }
    },
  },
  spray: {
    id: "spray",
    label: "Spray",
    hint: "Airbrush mist, densest in the middle",
    composite: "source-over",
    defaultSize: 48,
    paint: ({ ctx, stroke, random }) => {
      ctx.fillStyle = stroke.color;
      const dots = Math.round(6 + stroke.size / 3);
      const dotSize = 0.7 + stroke.size / 70;
      for (const point of resample(stroke.points, Math.max(2, stroke.size / 6))) {
        const radius = (stroke.size / 2) * pressureScale(point.p);
        for (let i = 0; i < dots; i++) {
          const angle = random() * TAU;
          const r = radius * random() * random() ** 0.25;
          ctx.globalAlpha = 0.35 + random() * 0.5;
          ctx.beginPath();
          ctx.arc(
            point.x + Math.cos(angle) * r,
            point.y + Math.sin(angle) * r,
            dotSize * (0.5 + random()),
            0,
            TAU,
          );
          ctx.fill();
        }
      }
    },
  },
  calligraphy: {
    id: "calligraphy",
    label: "Calligraphy",
    hint: "Angled nib: thick one way, thin the other",
    composite: "source-over",
    defaultSize: 22,
    paint: ({ ctx, stroke }) => {
      ctx.fillStyle = stroke.color;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 1;
      const nib = (p: Point) => {
        const half = (stroke.size / 2) * pressureScale(p.p);
        return { x: Math.cos(-Math.PI / 4) * half, y: Math.sin(-Math.PI / 4) * half };
      };
      const points = resample(stroke.points, 1.5);
      if (points.length === 1) points.push({ ...points[0]!, x: points[0]!.x + 0.5 });
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const na = nib(a);
        const nb = nib(b);
        ctx.beginPath();
        ctx.moveTo(a.x + na.x, a.y + na.y);
        ctx.lineTo(b.x + nb.x, b.y + nb.y);
        ctx.lineTo(b.x - nb.x, b.y - nb.y);
        ctx.lineTo(a.x - na.x, a.y - na.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke(); // seals hairline gaps between quads
      }
    },
  },
  neon: {
    id: "neon",
    label: "Neon",
    hint: "Glowing tube light. Try it on a dark background",
    composite: "source-over",
    defaultSize: 16,
    paint: ({ ctx, stroke, pixelScale }) => {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = stroke.size * 1.4 * pixelScale;
      strokePath(ctx, stroke, stroke.size * 0.6, stroke.color);
      strokePath(ctx, stroke, stroke.size * 0.45, stroke.color);
      ctx.shadowBlur = 0;
      strokePath(ctx, stroke, stroke.size * 0.2, tint(stroke.color, 0.75));
    },
  },
  rainbow: {
    id: "rainbow",
    label: "Rainbow",
    hint: "Cycles through hues as you draw, starting from your color",
    composite: "source-over",
    defaultSize: 18,
    paint: ({ ctx, stroke }) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const base = hexToHsl(stroke.color);
      const color = (travelled: number) =>
        hslToHex({ h: base.h + travelled * 0.5, s: Math.max(base.s, 75), l: 55 });
      if (paintDot(ctx, stroke, () => stroke.size / 2, color(0))) return;
      let travelled = 0;
      for (const segment of smoothSegments(stroke.points)) {
        ctx.strokeStyle = color(travelled);
        ctx.lineWidth = stroke.size * pressureScale(segment.ctrl.p);
        ctx.beginPath();
        traceSegment(ctx, segment, true);
        ctx.stroke();
        travelled += distance(segment.from, segment.to);
      }
    },
  },
  sparkle: {
    id: "sparkle",
    label: "Sparkle",
    hint: "Scatters stars, dots and diamonds in shades of your color",
    composite: "source-over",
    defaultSize: 30,
    paint: ({ ctx, stroke, random }) => {
      const base = hexToHsl(stroke.color);
      for (const point of resample(stroke.points, Math.max(4, stroke.size * 0.9))) {
        const spread = stroke.size * 0.6;
        const x = point.x + (random() - 0.5) * 2 * spread;
        const y = point.y + (random() - 0.5) * 2 * spread;
        const radius = stroke.size * (0.2 + random() * 0.3) * pressureScale(point.p);
        ctx.fillStyle = hslToHex({
          h: base.h + (random() - 0.5) * 70,
          s: Math.max(base.s, 60),
          l: Math.min(85, Math.max(30, base.l + (random() - 0.5) * 30)),
        });
        const shape = random();
        const rotation = random() * TAU;
        ctx.beginPath();
        if (shape < 0.5) traceStar(ctx, x, y, radius, rotation);
        else if (shape < 0.8) ctx.arc(x, y, radius * 0.5, 0, TAU);
        else traceDiamond(ctx, x, y, radius, rotation);
        ctx.fill();
      }
    },
  },
  threads: {
    id: "threads",
    label: "Threads",
    hint: "Spins fine webs between nearby parts of the stroke",
    composite: "source-over",
    defaultSize: 40,
    paint: ({ ctx, stroke, random }) => {
      ctx.lineCap = "round";
      strokePath(ctx, stroke, Math.max(1, stroke.size * 0.05), stroke.color);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(0.6, stroke.size * 0.025);
      const reach = stroke.size * 2;
      const points = resample(stroke.points, 4);
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        for (let j = Math.max(0, i - 40); j < i - 2; j++) {
          const b = points[j]!;
          const d = distance(a, b);
          if (d > reach || random() > 0.45) continue;
          ctx.globalAlpha = 0.25 * (1 - d / reach);
          const nudge = d * 0.2;
          ctx.beginPath();
          ctx.moveTo(a.x + (random() - 0.5) * nudge, a.y + (random() - 0.5) * nudge);
          ctx.lineTo(b.x + (random() - 0.5) * nudge, b.y + (random() - 0.5) * nudge);
          ctx.stroke();
        }
      }
    },
  },
  eraser: {
    id: "eraser",
    label: "Eraser",
    hint: "Removes marks and shows the background again",
    composite: "destination-out",
    defaultSize: 36,
    paint: ({ ctx, stroke }) => strokePath(ctx, stroke, stroke.size, "#000000"),
  },
};

/** One continuous path: no darker spots where the line crosses itself. */
function strokePath(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  if (paintDot(ctx, stroke, () => width / 2, color)) return;
  ctx.beginPath();
  smoothSegments(stroke.points).forEach((segment, i) => traceSegment(ctx, segment, i === 0));
  ctx.stroke();
}

/** A tap without movement still leaves a mark. Returns true if it handled the stroke. */
function paintDot(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  radius: (p: Point) => number,
  color?: string,
): boolean {
  const [only, ...rest] = stroke.points;
  if (!only || rest.length > 0) return false;
  if (color) ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(only.x, only.y, Math.max(0.5, radius(only)), 0, TAU);
  ctx.fill();
  return true;
}

function traceSegment(ctx: CanvasRenderingContext2D, segment: Segment, moveFirst: boolean) {
  if (moveFirst) ctx.moveTo(segment.from.x, segment.from.y);
  ctx.quadraticCurveTo(segment.ctrl.x, segment.ctrl.y, segment.to.x, segment.to.y);
}

function traceStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = rot + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function traceDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  for (let i = 0; i < 4; i++) {
    const radius = i % 2 === 0 ? r : r * 0.55;
    const angle = rot + (i * Math.PI) / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
