import { hexToHsl, hslToHex, tint } from "./color";
import { distance, pressureScale, resample, smoothSegments, type Segment } from "./geometry";
import { decodeRuns, type FillMask } from "./fill";
import { createRandom } from "./random";
import type { BrushId, Point, Stroke } from "./types";

/**
 * Every brush paints a stroke as a list of small "units" (curve segments or evenly spaced
 * samples). A brush can paint any range of units, and painting [0, k) then [k, n) gives
 * exactly the same picture as painting [0, n) at once. That is what lets a stroke in
 * progress paint only its new tip each frame instead of redrawing from the start.
 *
 * Randomness is seeded per unit (not one running sequence) for the same reason.
 */
export interface BrushPaint {
  ctx: CanvasRenderingContext2D;
  stroke: Stroke;
  /** Device pixels per document pixel. Shadows ignore transforms, so glow needs it. */
  pixelScale: number;
  /** First unit to paint. */
  from: number;
  /** Paint up to, not including, this unit. Infinity paints to the end. */
  until: number;
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
  /** Paints units [from, until) and returns how many units the whole stroke has. */
  paint: (brush: BrushPaint) => number;
}

const TAU = Math.PI * 2;
const PATTERN_STYLES = ["Zigzag", "Waves", "Dots", "Candy stripes"] as const;
/** Neon paints this many curve segments per unit (one glow pass each instead of per segment). */
const NEON_RUN = 12;
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

/** The random stream for one unit: same stroke + same unit = same numbers, always. */
function randomAt(stroke: Stroke, unit: number): () => number {
  return createRandom((stroke.seed ^ Math.imul(unit + 1, 0x9e3779b1)) >>> 0);
}

/** Calls `paint` for each index in [from, until) that exists; returns the unit count. */
function eachUnit(count: number, from: number, until: number, paint: (i: number) => void) {
  const end = Math.min(count, until);
  for (let i = Math.max(0, from); i < end; i++) paint(i);
  return count;
}

export const BRUSHES: Record<BrushId, BrushDefinition> = {
  pen: {
    id: "pen",
    label: "Pen",
    hint: "Smooth ink; thin to thick with stylus pressure",
    composite: "source-over",
    defaultSize: 10,
    options: [],
    paint: (b) => variableWidthPath(b, b.stroke.color),
  },
  marker: {
    id: "marker",
    label: "Marker",
    hint: "See-through ink that darkens where strokes overlap",
    composite: "multiply",
    strokeAlpha: 0.7,
    defaultSize: 28,
    options: [],
    paint: (b) => variableWidthPath(b, b.stroke.color),
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    hint: "Grainy graphite; darker as you press",
    composite: "source-over",
    defaultSize: 6,
    options: [],
    paint: ({ ctx, stroke, from, until }) => {
      ctx.fillStyle = stroke.color;
      const grains = Math.min(14, Math.max(2, Math.round(stroke.size * 0.8)));
      const samples = resample(stroke.points, Math.max(1.5, stroke.size / 8));
      return eachUnit(samples.length, from, until, (i) => {
        const point = samples[i]!;
        const random = randomAt(stroke, i);
        const radius = (stroke.size / 2) * pressureScale(point.p);
        const darkness = 0.35 + 0.65 * point.p;
        const grain = Math.max(1.3, stroke.size / 10);
        for (let g = 0; g < grains; g++) {
          ctx.globalAlpha = (0.12 + random() * 0.4) * darkness;
          const angle = random() * TAU;
          const r = radius * random();
          ctx.fillRect(point.x + Math.cos(angle) * r, point.y + Math.sin(angle) * r, grain, grain);
        }
      });
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
    paint: ({ ctx, stroke, from, until }) => {
      ctx.fillStyle = stroke.color;
      const dots = Math.max(1, Math.round((6 + stroke.size / 3) * optionValue(stroke, "density")));
      const dotSize = 0.7 + stroke.size / 70;
      const samples = resample(stroke.points, Math.max(2, stroke.size / 6));
      return eachUnit(samples.length, from, until, (i) => {
        const point = samples[i]!;
        const random = randomAt(stroke, i);
        const radius = (stroke.size / 2) * pressureScale(point.p);
        for (let d = 0; d < dots; d++) {
          const angle = random() * TAU;
          const r = radius * random() * random() ** 0.25;
          const size = dotSize * (0.5 + random());
          ctx.globalAlpha = 0.35 + random() * 0.5;
          // Squares are far cheaper than circles and read the same at this size.
          ctx.fillRect(
            point.x + Math.cos(angle) * r - size,
            point.y + Math.sin(angle) * r - size,
            size * 2,
            size * 2,
          );
        }
      });
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
    paint: ({ ctx, stroke, from, until }) => {
      ctx.fillStyle = stroke.color;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      // Angle is measured like a clock hand going up from horizontal.
      const radians = (-optionValue(stroke, "angle") * Math.PI) / 180;
      const nib = (p: Point) => {
        const half = (stroke.size / 2) * pressureScale(p.p);
        return { x: Math.cos(radians) * half, y: Math.sin(radians) * half };
      };
      const points = resample(stroke.points, 3);
      if (points.length === 1) points.push({ ...points[0]!, x: points[0]!.x + 0.5 });
      return eachUnit(points.length - 1, from, until, (i) => {
        const a = points[i]!;
        const b = points[i + 1]!;
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
      });
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
    paint: ({ ctx, stroke, pixelScale, from, until }) => {
      // Soft light in layers: a wide faint halo, a blurred tube, then a pale core that is
      // itself slightly blurred, so no edge reads as a hard line. Each segment gets all
      // layers, so the glow builds evenly along the stroke however it's painted.
      const glow = optionValue(stroke, "glow");
      const pale = tint(stroke.color, 0.45);
      const core = tint(stroke.color, 0.4);
      const layers = (width: number, draw: (w: number) => void) => {
        const blur = (amount: number) => amount * width * glow * pixelScale;
        ctx.shadowColor = stroke.color;
        ctx.strokeStyle = ctx.fillStyle = stroke.color;
        ctx.globalAlpha = 0.3;
        ctx.shadowBlur = blur(4);
        draw(width * 1.1);
        ctx.shadowBlur = blur(2.4);
        draw(width * 0.8);
        ctx.globalAlpha = 0.6;
        ctx.shadowBlur = blur(1.4);
        draw(width * 0.5);
        ctx.globalAlpha = 1;
        ctx.shadowColor = core;
        ctx.strokeStyle = ctx.fillStyle = pale;
        ctx.shadowBlur = blur(0.5);
        draw(width * 0.22);
        ctx.shadowBlur = 0;
      };
      const [only, ...rest] = stroke.points;
      if (only && rest.length === 0) {
        if (from > 0 || until < 1) return 1;
        layers(stroke.size * pressureScale(only.p), (w) => {
          ctx.beginPath();
          ctx.arc(only.x, only.y, w / 2, 0, TAU);
          ctx.fill();
        });
        return 1;
      }
      // Glow is costly, so each unit is a run of segments painted as one path per layer.
      ctx.lineCap = "butt"; // runs meet end to end, so caps would double up
      ctx.lineJoin = "round";
      const segments = smoothSegments(stroke.points);
      const runs = Math.ceil(segments.length / NEON_RUN);
      return eachUnit(runs, from, until, (r) => {
        const run = segments.slice(r * NEON_RUN, (r + 1) * NEON_RUN);
        const pressure = run.reduce((sum, seg) => sum + seg.ctrl.p, 0) / run.length;
        const first = r === 0 ? run[0] : undefined;
        const last = r === runs - 1 ? run[run.length - 1] : undefined;
        layers(stroke.size * pressureScale(pressure), (w) => {
          ctx.lineWidth = w;
          ctx.beginPath();
          run.forEach((segment, k) => traceSegment(ctx, segment, k === 0));
          ctx.stroke();
          // Rounded ends: a half circle facing outward at the stroke's start and end only.
          // (Round caps on every run would overlap at the joins and glow brighter there.)
          if (first) roundEnd(ctx, first.from, first.ctrl, w);
          if (last) roundEnd(ctx, last.to, last.ctrl, w);
        });
      });
    },
  },
  rainbow: {
    id: "rainbow",
    label: "Rainbow",
    hint: "Cycles through hues as you draw, starting from your color",
    composite: "source-over",
    defaultSize: 18,
    options: [],
    paint: ({ ctx, stroke, from, until }) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const base = hexToHsl(stroke.color);
      const color = (travelled: number) =>
        hslToHex({ h: base.h + travelled * 0.5, s: Math.max(base.s, 75), l: 55 });
      if (stroke.points.length === 1) {
        if (from === 0 && until >= 1) {
          paintDot(
            ctx,
            stroke.points[0]!,
            (stroke.size * pressureScale(stroke.points[0]!.p)) / 2,
            color(0),
          );
        }
        return 1;
      }
      const segments = smoothSegments(stroke.points);
      // Hue depends on distance travelled, so add up the segments before `from` too.
      let travelled = 0;
      const end = Math.min(segments.length, until);
      for (let i = 0; i < end; i++) {
        const segment = segments[i]!;
        if (i >= from) {
          ctx.strokeStyle = color(travelled);
          ctx.lineWidth = stroke.size * pressureScale(segment.ctrl.p);
          ctx.beginPath();
          traceSegment(ctx, segment, true);
          ctx.stroke();
        }
        travelled += distance(segment.from, segment.to);
      }
      return segments.length;
    },
  },
  sparkle: {
    id: "sparkle",
    label: "Sparkle",
    hint: "Scatters stars, dots and diamonds in shades of your color",
    composite: "source-over",
    defaultSize: 30,
    options: [SPACING, SCATTER],
    paint: ({ ctx, stroke, from, until }) => {
      const base = hexToHsl(stroke.color);
      const spacing = Math.max(4, stroke.size * 0.9 * optionValue(stroke, "spacing"));
      const spread = stroke.size * 0.6 * optionValue(stroke, "scatter");
      const samples = resample(stroke.points, spacing);
      return eachUnit(samples.length, from, until, (i) => {
        const point = samples[i]!;
        const random = randomAt(stroke, i);
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
      });
    },
  },
  hearts: {
    id: "hearts",
    label: "Hearts",
    hint: "A trail of hearts in shades of your color",
    composite: "source-over",
    defaultSize: 34,
    options: [SPACING, SCATTER],
    paint: ({ ctx, stroke, from, until }) => {
      const base = hexToHsl(stroke.color);
      const spacing = Math.max(4, stroke.size * 1.05 * optionValue(stroke, "spacing"));
      const spread = stroke.size * 0.35 * optionValue(stroke, "scatter");
      const samples = resample(stroke.points, spacing);
      return eachUnit(samples.length, from, until, (i) => {
        const point = samples[i]!;
        const random = randomAt(stroke, i);
        const radius = stroke.size * (0.32 + random() * 0.22) * pressureScale(point.p);
        const x = point.x + (random() - 0.5) * spread;
        const y = point.y + (random() - 0.5) * spread;
        const hex = hslToHex({
          h: base.h + (random() - 0.5) * 30,
          s: Math.max(base.s, 55),
          l: Math.min(82, Math.max(28, base.l + (random() - 0.5) * 26)),
        });
        const rotation = (random() - 0.5) * 0.8;
        const outlined = random() < 0.22;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(radius, radius);
        ctx.beginPath();
        traceHeart(ctx);
        if (outlined) {
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
      });
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
    paint: ({ ctx, stroke, from, until }) => {
      const style = Math.round(optionValue(stroke, "style"));
      const period = Math.max(6, stroke.size * optionValue(stroke, "scale"));
      const frames = alongPath(resample(stroke.points, 2));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      if (frames.length < 2) {
        if (from === 0 && until >= 1 && stroke.points[0]) {
          paintDot(ctx, stroke.points[0], stroke.size / 2, stroke.color);
        }
        return 1;
      }
      const half = (i: number) => (stroke.size / 2) * pressureScale(frames[i]!.p);
      const pale = tint(stroke.color, 0.8);
      // Zigzag / waves: where the swinging line is at frame i.
      const swingAt = (i: number) => {
        const f = frames[i]!;
        const phase = (f.travelled / period) * 2;
        const swing = style === 0 ? 1 - 2 * Math.abs((phase % 2) - 1) : Math.sin(phase * Math.PI);
        return { x: f.x + f.nx * swing * half(i) * 0.8, y: f.y + f.ny * swing * half(i) * 0.8 };
      };
      const dotStep = period * 0.55;
      return eachUnit(frames.length, from, until, (i) => {
        const f = frames[i]!;
        if (style === 0 || style === 1) {
          if (i === 0) return;
          const a = swingAt(i - 1);
          const b = swingAt(i);
          ctx.lineWidth = Math.max(1.5, stroke.size * 0.16);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (style === 2) {
          // Dots: one each time the path crosses another dot spacing, in two staggered rows.
          const k = Math.floor(f.travelled / dotStep);
          if (i > 0 && Math.floor(frames[i - 1]!.travelled / dotStep) === k) return;
          const side = k % 2 === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.arc(
            f.x + f.nx * side * half(i) * 0.5,
            f.y + f.ny * side * half(i) * 0.5,
            Math.max(1, half(i) * 0.38),
            0,
            TAU,
          );
          ctx.fill();
        } else {
          // Candy stripes: a band of alternating color and pale tint.
          if (i === 0) return;
          const a = frames[i - 1]!;
          const band = Math.floor(f.travelled / (period * 0.5)) % 2;
          ctx.fillStyle = band === 0 ? stroke.color : pale;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x + a.nx * half(i - 1), a.y + a.ny * half(i - 1));
          ctx.lineTo(f.x + f.nx * half(i), f.y + f.ny * half(i));
          ctx.lineTo(f.x - f.nx * half(i), f.y - f.ny * half(i));
          ctx.lineTo(a.x - a.nx * half(i - 1), a.y - a.ny * half(i - 1));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
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
    paint: ({ ctx, stroke, from, until }) => {
      ctx.lineCap = "round";
      ctx.strokeStyle = stroke.color;
      const spine = Math.max(1, stroke.size * 0.05);
      const thread = Math.max(0.6, stroke.size * 0.025);
      const reach = stroke.size * 2;
      const reach2 = reach * reach;
      const chance = Math.min(1, 0.45 * optionValue(stroke, "web"));
      const points = resample(stroke.points, 5);
      return eachUnit(points.length, from, until, (i) => {
        const a = points[i]!;
        // The spine: a fine line back to the previous sample.
        if (i > 0) {
          const prev = points[i - 1]!;
          ctx.globalAlpha = 1;
          ctx.lineWidth = spine;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
        // Threads to nearby earlier samples.
        const random = randomAt(stroke, i);
        ctx.lineWidth = thread;
        for (let j = Math.max(0, i - 26); j < i - 2; j++) {
          const b = points[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          const roll = random();
          if (d2 > reach2 || roll > chance) continue;
          const d = Math.sqrt(d2);
          ctx.globalAlpha = 0.25 * (1 - d / reach);
          const nudge = d * 0.2;
          ctx.beginPath();
          ctx.moveTo(a.x + (random() - 0.5) * nudge, a.y + (random() - 0.5) * nudge);
          ctx.lineTo(b.x + (random() - 0.5) * nudge, b.y + (random() - 0.5) * nudge);
          ctx.stroke();
        }
      });
    },
  },
  fill: {
    id: "fill",
    label: "Fill",
    hint: "Fills an area or a shape with solid color",
    composite: "source-over",
    defaultSize: 1,
    options: [],
    // One unit: a fill-tool area (a mask) or a filled shape (a closed outline).
    paint: ({ ctx, stroke, from, until }) => {
      if (from > 0 || until < 1) return 1;
      if (stroke.mask) {
        const image = maskImage(stroke.mask, stroke.color);
        if (image) ctx.drawImage(image, 0, 0);
        return 1;
      }
      const [first, ...rest] = stroke.points;
      if (!first || rest.length < 2) return 1;
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const p of rest) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
      return 1;
    },
  },
  eraser: {
    id: "eraser",
    label: "Eraser",
    hint: "Removes marks and shows the background again",
    composite: "destination-out",
    defaultSize: 36,
    options: [],
    paint: (b) => variableWidthPath(b, "#000000"),
  },
};

/**
 * Smooth line whose width follows pressure. One unit per curve segment. Only for brushes
 * painted at full alpha (see-through brushes use strokeAlpha, applied to the whole stroke).
 */
function variableWidthPath({ ctx, stroke, from, until }: BrushPaint, color: string): number {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const [only, ...rest] = stroke.points;
  if (only && rest.length === 0) {
    if (from === 0 && until >= 1) {
      paintDot(ctx, only, (stroke.size * pressureScale(only.p)) / 2, color);
    }
    return 1;
  }
  const segments = smoothSegments(stroke.points);
  return eachUnit(segments.length, from, until, (i) => {
    const segment = segments[i]!;
    ctx.lineWidth = stroke.size * pressureScale(segment.ctrl.p);
    ctx.beginPath();
    traceSegment(ctx, segment, true);
    ctx.stroke();
  });
}

/**
 * A fill area as an image in its color, built once and reused: fills are redrawn on every
 * zoom and undo, and decoding the runs each time would be wasteful.
 */
const maskImages = new WeakMap<FillMask, { color: string; image: CanvasImageSource }>();
function maskImage(mask: FillMask, color: string): CanvasImageSource | null {
  const cached = maskImages.get(mask);
  if (cached?.color === color) return cached.image;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pixels = ctx.createImageData(mask.width, mask.height);
  const bits = decodeRuns(mask);
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    pixels.data[i * 4] = r;
    pixels.data[i * 4 + 1] = g;
    pixels.data[i * 4 + 2] = b;
    pixels.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  maskImages.set(mask, { color, image: canvas });
  return canvas;
}

/** Each point with its distance along the path, pressure, and a unit normal. */
function alongPath(points: Point[]) {
  let travelled = 0;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    if (i > 0) travelled += distance(prev, p);
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: p.x, y: p.y, p: p.p, travelled, nx: -ty / len, ny: tx / len };
  });
}

/** Half-circle cap at `at`, bulging away from `toward` (the path's direction there). */
function roundEnd(ctx: CanvasRenderingContext2D, at: Point, toward: Point, width: number) {
  const angle = Math.atan2(at.y - toward.y, at.x - toward.x);
  ctx.beginPath();
  ctx.arc(at.x, at.y, width / 2, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

function paintDot(ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(at.x, at.y, Math.max(0.5, radius), 0, TAU);
  ctx.fill();
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
