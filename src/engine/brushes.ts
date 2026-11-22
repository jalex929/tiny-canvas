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

/** An extra setting a brush offers, shown as a slider. Stored on each stroke. */
export interface BrushOption {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** How the value reads next to the slider. */
  format: (value: number) => string;
  /** When set, the option is a pick-one list (value = index) instead of a slider. */
  choices?: string[];
}

export interface BrushDefinition {
  id: BrushId;
  label: string;
  hint: string;
  /** How the finished stroke combines with what is already on the canvas. */
  composite: GlobalCompositeOperation;
  /**
   * Built-in see-through-ness, applied once to the whole stroke (like opacity) so the
   * stroke doesn't darken where it overlaps itself.
   */
  strokeAlpha?: number;
  defaultSize: number;
  options: BrushOption[];
  paint: (brush: BrushPaint) => void;
}

const TAU = Math.PI * 2;
const PATTERN_STYLES = ["Zigzag", "Waves", "Dots", "Candy stripes"] as const;
const percent = (v: number) => `${Math.round(v * 100)}%`;

const SPACING: BrushOption = {
  key: "spacing",
  label: "Spacing",
  min: 0.4,
  max: 2.5,
  step: 0.1,
  default: 1,
  format: percent,
};
const SCATTER: BrushOption = {
  key: "scatter",
  label: "Scatter",
  min: 0,
  max: 2,
  step: 0.1,
  default: 1,
  format: percent,
};

/** Reads a brush option from the stroke, falling back to the brush's default. */
export function optionValue(stroke: Stroke, key: string): number {
  const fromStroke = stroke.options?.[key];
  if (typeof fromStroke === "number" && Number.isFinite(fromStroke)) return fromStroke;
  const spec = BRUSHES[stroke.brush].options.find((o) => o.key === key);
  return spec?.default ?? 1;
}

export function defaultOptions(id: BrushId): Record<string, number> {
  return Object.fromEntries(BRUSHES[id].options.map((o) => [o.key, o.default]));
}

export const BRUSHES: Record<BrushId, BrushDefinition> = {
  pen: {
    id: "pen",
    label: "Pen",
    hint: "Smooth ink; thin to thick with stylus pressure",
    composite: "source-over",
    defaultSize: 10,
    options: [],
    paint: ({ ctx, stroke }) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      variableWidthPath(ctx, stroke, stroke.size);
    },
  },
  marker: {
    id: "marker",
    label: "Marker",
    hint: "See-through ink that darkens where strokes overlap",
    composite: "multiply",
    strokeAlpha: 0.7,
    defaultSize: 28,
    options: [],
    paint: ({ ctx, stroke }) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      variableWidthPath(ctx, stroke, stroke.size);
    },
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    hint: "Grainy graphite; darker as you press",
    composite: "source-over",
    defaultSize: 6,
    options: [],
    paint: ({ ctx, stroke, random }) => {
      ctx.fillStyle = stroke.color;
      const grains = Math.max(2, Math.round(stroke.size * 0.8));
      for (const point of resample(stroke.points, 1.5)) {
        const radius = (stroke.size / 2) * pressureScale(point.p);
        const darkness = 0.35 + 0.65 * point.p;
        for (let i = 0; i < grains; i++) {
          ctx.globalAlpha = (0.12 + random() * 0.4) * darkness;
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
    options: [
      {
        key: "density",
        label: "Density",
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1,
        format: percent,
      },
    ],
    paint: ({ ctx, stroke, random }) => {
      ctx.fillStyle = stroke.color;
      const dots = Math.max(1, Math.round((6 + stroke.size / 3) * optionValue(stroke, "density")));
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
    options: [
      {
        key: "angle",
        label: "Nib angle",
        min: 0,
        max: 180,
        step: 5,
        default: 45,
        format: (v) => `${Math.round(v)}°`,
      },
    ],
    paint: ({ ctx, stroke }) => {
      ctx.fillStyle = stroke.color;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 1;
      // Angle is measured like a clock hand going up from horizontal.
      const radians = (-optionValue(stroke, "angle") * Math.PI) / 180;
      const nib = (p: Point) => {
        const half = (stroke.size / 2) * pressureScale(p.p);
        return { x: Math.cos(radians) * half, y: Math.sin(radians) * half };
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
    defaultSize: 24,
    options: [
      { key: "glow", label: "Glow", min: 0.2, max: 3, step: 0.1, default: 1, format: percent },
    ],
    paint: ({ ctx, stroke, pixelScale }) => {
      // Soft light, built in layers: a wide faint halo, a blurred tube, then a pale core
      // that is itself slightly blurred, so no edge reads as a hard line.
      const width = stroke.size * averagePressureScale(stroke);
      const glow = optionValue(stroke, "glow");
      const blur = (amount: number) => amount * width * glow * pixelScale;
      ctx.shadowColor = stroke.color;

      ctx.globalAlpha = 0.3;
      ctx.shadowBlur = blur(4);
      strokePath(ctx, stroke, width * 1.1, stroke.color);
      ctx.shadowBlur = blur(2.4);
      strokePath(ctx, stroke, width * 0.8, stroke.color);

      ctx.globalAlpha = 0.6;
      ctx.shadowBlur = blur(1.4);
      strokePath(ctx, stroke, width * 0.5, stroke.color);

      ctx.globalAlpha = 1;
      ctx.shadowColor = tint(stroke.color, 0.4);
      ctx.shadowBlur = blur(0.5);
      strokePath(ctx, stroke, width * 0.22, tint(stroke.color, 0.45));
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    },
  },
  rainbow: {
    id: "rainbow",
    label: "Rainbow",
    hint: "Cycles through hues as you draw, starting from your color",
    composite: "source-over",
    defaultSize: 18,
    options: [],
    paint: ({ ctx, stroke }) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const base = hexToHsl(stroke.color);
      const color = (travelled: number) =>
        hslToHex({ h: base.h + travelled * 0.5, s: Math.max(base.s, 75), l: 55 });
      if (paintDot(ctx, stroke, (p) => (stroke.size * pressureScale(p.p)) / 2, color(0))) return;
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
    options: [SPACING, SCATTER],
    paint: ({ ctx, stroke, random }) => {
      const base = hexToHsl(stroke.color);
      const spacing = Math.max(4, stroke.size * 0.9 * optionValue(stroke, "spacing"));
      const spread = stroke.size * 0.6 * optionValue(stroke, "scatter");
      for (const point of resample(stroke.points, spacing)) {
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
  hearts: {
    id: "hearts",
    label: "Hearts",
    hint: "A trail of hearts in shades of your color",
    composite: "source-over",
    defaultSize: 34,
    options: [SPACING, SCATTER],
    paint: ({ ctx, stroke, random }) => {
      const base = hexToHsl(stroke.color);
      const spacing = Math.max(4, stroke.size * 1.05 * optionValue(stroke, "spacing"));
      const spread = stroke.size * 0.35 * optionValue(stroke, "scatter");
      for (const point of resample(stroke.points, spacing)) {
        const radius = stroke.size * (0.32 + random() * 0.22) * pressureScale(point.p);
        const x = point.x + (random() - 0.5) * spread;
        const y = point.y + (random() - 0.5) * spread;
        const hex = hslToHex({
          h: base.h + (random() - 0.5) * 30,
          s: Math.max(base.s, 55),
          l: Math.min(82, Math.max(28, base.l + (random() - 0.5) * 26)),
        });
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((random() - 0.5) * 0.8);
        ctx.scale(radius, radius);
        ctx.beginPath();
        traceHeart(ctx);
        if (random() < 0.22) {
          // An occasional outlined heart keeps the trail from looking stamped.
          ctx.strokeStyle = hex;
          ctx.lineWidth = 0.22;
          ctx.lineJoin = "round";
          ctx.stroke();
        } else {
          ctx.fillStyle = hex;
          ctx.fill();
        }
        ctx.restore();
      }
    },
  },
  pattern: {
    id: "pattern",
    label: "Pattern",
    hint: "Draws a repeating pattern along your stroke",
    composite: "source-over",
    defaultSize: 30,
    options: [
      {
        key: "style",
        label: "Style",
        min: 0,
        max: 3,
        step: 1,
        default: 0,
        format: (v) => PATTERN_STYLES[Math.round(v)] ?? "",
        choices: [...PATTERN_STYLES],
      },
      { key: "scale", label: "Scale", min: 0.4, max: 2.5, step: 0.1, default: 1, format: percent },
    ],
    paint: ({ ctx, stroke }) => {
      const style = Math.round(optionValue(stroke, "style"));
      const scale = optionValue(stroke, "scale");
      const points = resample(stroke.points, 2);
      if (points.length < 2) {
        paintDot(ctx, stroke, () => stroke.size / 2, stroke.color);
        return;
      }
      const frames = alongPath(points);
      const half = (i: number) => (stroke.size / 2) * pressureScale(points[i]!.p);
      const period = Math.max(6, stroke.size * scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;

      if (style === 0 || style === 1) {
        // 0 Zigzag, 1 Waves: a line swinging side to side across the stroke.
        ctx.lineWidth = Math.max(1.5, stroke.size * 0.16);
        ctx.beginPath();
        frames.forEach((f, i) => {
          const phase = (f.travelled / period) * 2;
          const swing = style === 0 ? 1 - 2 * Math.abs((phase % 2) - 1) : Math.sin(phase * Math.PI);
          const x = f.x + f.nx * swing * half(i) * 0.8;
          const y = f.y + f.ny * swing * half(i) * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      } else if (style === 2) {
        // Dots: two staggered rows of polka dots.
        let next = 0;
        let row = 0;
        frames.forEach((f, i) => {
          if (f.travelled < next) return;
          const side = row % 2 === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.arc(
            f.x + f.nx * side * half(i) * 0.5,
            f.y + f.ny * side * half(i) * 0.5,
            Math.max(1, half(i) * 0.38),
            0,
            TAU,
          );
          ctx.fill();
          next += period * 0.55;
          row++;
        });
      } else {
        // Candy stripes: a band of alternating color and pale tint.
        const pale = tint(stroke.color, 0.8);
        for (let i = 1; i < frames.length; i++) {
          const a = frames[i - 1]!;
          const b = frames[i]!;
          const band = Math.floor(b.travelled / (period * 0.5)) % 2;
          ctx.fillStyle = band === 0 ? stroke.color : pale;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x + a.nx * half(i - 1), a.y + a.ny * half(i - 1));
          ctx.lineTo(b.x + b.nx * half(i), b.y + b.ny * half(i));
          ctx.lineTo(b.x - b.nx * half(i), b.y - b.ny * half(i));
          ctx.lineTo(a.x - a.nx * half(i - 1), a.y - a.ny * half(i - 1));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    },
  },
  threads: {
    id: "threads",
    label: "Threads",
    hint: "Spins fine webs between nearby parts of the stroke",
    composite: "source-over",
    defaultSize: 40,
    options: [
      { key: "web", label: "Web", min: 0.2, max: 2, step: 0.1, default: 1, format: percent },
    ],
    paint: ({ ctx, stroke, random }) => {
      ctx.lineCap = "round";
      strokePath(ctx, stroke, Math.max(1, stroke.size * 0.05), stroke.color);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(0.6, stroke.size * 0.025);
      const reach = stroke.size * 2;
      const chance = Math.min(1, 0.45 * optionValue(stroke, "web"));
      const points = resample(stroke.points, 4);
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        for (let j = Math.max(0, i - 40); j < i - 2; j++) {
          const b = points[j]!;
          const d = distance(a, b);
          if (d > reach || random() > chance) continue;
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
    options: [],
    paint: ({ ctx, stroke }) => {
      ctx.strokeStyle = "#000000";
      ctx.fillStyle = "#000000";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      variableWidthPath(ctx, stroke, stroke.size);
    },
  },
};

/**
 * Smooth line whose width follows pressure. Each segment is its own path, so this only
 * suits brushes painted at full alpha (see-through brushes use strokeAlpha instead).
 */
function variableWidthPath(ctx: CanvasRenderingContext2D, stroke: Stroke, size: number) {
  if (paintDot(ctx, stroke, (p) => (size * pressureScale(p.p)) / 2)) return;
  for (const segment of smoothSegments(stroke.points)) {
    ctx.lineWidth = size * pressureScale(segment.ctrl.p);
    ctx.beginPath();
    traceSegment(ctx, segment, true);
    ctx.stroke();
  }
}

/** Each point with its distance along the path and a unit normal (perpendicular). */
function alongPath(points: Point[]) {
  let travelled = 0;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    if (i > 0) travelled += distance(prev, p);
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: p.x, y: p.y, travelled, nx: -ty / len, ny: tx / len };
  });
}

function averagePressureScale(stroke: Stroke): number {
  if (stroke.points.length === 0) return 1;
  const total = stroke.points.reduce((sum, p) => sum + pressureScale(p.p), 0);
  return total / stroke.points.length;
}

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

/** A heart about 2 units wide, centered on the origin, point down. */
function traceHeart(ctx: CanvasRenderingContext2D) {
  ctx.moveTo(0, -0.35);
  ctx.bezierCurveTo(-0.15, -0.85, -1, -0.85, -1, -0.2);
  ctx.bezierCurveTo(-1, 0.3, -0.45, 0.55, 0, 0.95);
  ctx.bezierCurveTo(0.45, 0.55, 1, 0.3, 1, -0.2);
  ctx.bezierCurveTo(1, -0.85, 0.15, -0.85, 0, -0.35);
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
