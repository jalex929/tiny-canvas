import type { SymmetryMode } from "./types";

/** 2D affine matrix in canvas order: [a, b, c, d, e, f]. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Copies for the modes that take a count (radial, kaleidoscope, spiral). */
export const DEFAULT_SYMMETRY_COUNT = 6;
export const MIN_SYMMETRY_COUNT = 2;
export const MAX_SYMMETRY_COUNT = 16;
/** Tile repeats the drawing on a grid of thirds. */
const TILE_DIVISIONS = 3;
/**
 * Spiral: each copy turns a little (not a full share of the circle, which would just be
 * radial) and gets smaller, so the copies trail inward like a vortex arm.
 */
const SPIRAL_SHRINK = 0.85;
const SPIRAL_STEP = Math.PI / 6;
/** Tunnel: each copy this much smaller, straight toward the center. */
const TUNNEL_SHRINK = 0.78;
/** Bloom: size of the inner ring of petals. */
const BLOOM_INNER = 0.55;
/** Echo: each copy steps this fraction of the canvas down and right. */
const ECHO_STEP = 0.035;

export const SYMMETRY_INFO: Record<
  SymmetryMode,
  { label: string; description: string; usesCount: boolean; /** For small tiles. */ short?: string }
> = {
  none: { label: "Off", description: "No symmetry", usesCount: false },
  mirror: { label: "Mirror", description: "Mirrored left and right", usesCount: false },
  quad: {
    label: "Mirror ×4",
    description: "Mirrored left-right and top-bottom, 4 copies",
    usesCount: false,
  },
  diagonal: {
    label: "Diagonal",
    description: "Mirrored across both diagonals through the center, 4 copies",
    usesCount: false,
  },
  radial: { label: "Radial", description: "Turned around the center", usesCount: true },
  kaleidoscope: {
    label: "Kaleidoscope",
    short: "Kaleido",
    description: "Turned and mirrored around the center",
    usesCount: true,
  },
  spiral: {
    label: "Spiral",
    description: "Copies trail inward, each turned a little and smaller, like a vortex",
    usesCount: true,
  },
  tunnel: {
    label: "Tunnel",
    description: "Copies shrink straight toward the center, like looking down a tunnel",
    usesCount: true,
  },
  bloom: {
    label: "Bloom",
    description: "Two rings of petals: an outer ring and a smaller inner ring between them",
    usesCount: true,
  },
  tile: {
    label: "Tile",
    description: "Repeated across the canvas like wallpaper",
    usesCount: false,
  },
  quilt: {
    label: "Quilt",
    description: "Tiled with every other square mirrored, like a quilt or folded paper",
    usesCount: false,
  },
  echo: {
    label: "Echo",
    description: "Copies step down and to the right, like a motion trail",
    usesCount: true,
  },
};

export const clampCount = (n: number | undefined) =>
  Math.round(
    Math.min(MAX_SYMMETRY_COUNT, Math.max(MIN_SYMMETRY_COUNT, n ?? DEFAULT_SYMMETRY_COUNT)),
  );

/** Short label including the count, e.g. "Radial ×8". */
export function symmetryLabel(mode: SymmetryMode, count?: number): string {
  const info = SYMMETRY_INFO[mode];
  if (!info.usesCount) return info.label;
  const doubled = mode === "kaleidoscope" || mode === "bloom";
  const copies = doubled ? clampCount(count) * 2 : clampCount(count);
  return `${info.label} ×${copies}`;
}

/** Every copy a stroke is drawn with. The first entry is always the original. */
export function symmetryMatrices(
  mode: SymmetryMode,
  width: number,
  height: number,
  count: number = DEFAULT_SYMMETRY_COUNT,
): Matrix[] {
  const cx = width / 2;
  const cy = height / 2;
  const n = clampCount(count);
  const flipX: Matrix = [-1, 0, 0, 1, 2 * cx, 0];
  const flipY: Matrix = [1, 0, 0, -1, 0, 2 * cy];
  switch (mode) {
    case "none":
      return [IDENTITY];
    case "mirror":
      return [IDENTITY, flipX];
    case "quad":
      return [IDENTITY, flipX, flipY, multiply(flipX, flipY)];
    case "diagonal": {
      // Mirror lines at 45° and 135° through the center (x and y swap around it).
      const down: Matrix = [0, 1, 1, 0, cx - cy, cy - cx];
      const up: Matrix = [0, -1, -1, 0, cx + cy, cx + cy];
      return [IDENTITY, down, up, multiply(down, up)];
    }
    case "radial":
      return range(n).map((k) => turnAbout(cx, cy, (2 * Math.PI * k) / n));
    case "kaleidoscope":
      return range(n).flatMap((k) => {
        const rotation = turnAbout(cx, cy, (2 * Math.PI * k) / n);
        return [rotation, multiply(rotation, flipX)];
      });
    case "spiral":
      return range(n).map((k) => turnAbout(cx, cy, SPIRAL_STEP * k, SPIRAL_SHRINK ** k));
    case "tunnel":
      return range(n).map((k) => turnAbout(cx, cy, 0, TUNNEL_SHRINK ** k));
    case "bloom":
      return range(n).flatMap((k) => [
        turnAbout(cx, cy, (2 * Math.PI * k) / n),
        turnAbout(cx, cy, (2 * Math.PI * (k + 0.5)) / n, BLOOM_INNER),
      ]);
    case "echo": {
      const stepX = width * ECHO_STEP;
      const stepY = height * ECHO_STEP;
      return range(n).map((k): Matrix => [1, 0, 0, 1, k * stepX, k * stepY]);
    }
    case "quilt": {
      // Like tile, but odd columns flip left-right and odd rows flip top-bottom.
      const stepX = width / TILE_DIVISIONS;
      const stepY = height / TILE_DIVISIONS;
      const reach = TILE_DIVISIONS - 1;
      const out: Matrix[] = [IDENTITY];
      for (let i = -reach; i <= reach; i++) {
        for (let j = -reach; j <= reach; j++) {
          if (i === 0 && j === 0) continue;
          const flipCol = Math.abs(i) % 2 === 1;
          const flipRow = Math.abs(j) % 2 === 1;
          out.push([
            flipCol ? -1 : 1,
            0,
            0,
            flipRow ? -1 : 1,
            flipCol ? (i + 1) * stepX : i * stepX,
            flipRow ? (j + 1) * stepY : j * stepY,
          ]);
        }
      }
      return out;
    }
    case "tile": {
      // Enough copies that a mark anywhere repeats across the whole canvas.
      const stepX = width / TILE_DIVISIONS;
      const stepY = height / TILE_DIVISIONS;
      const reach = TILE_DIVISIONS - 1;
      const out: Matrix[] = [IDENTITY];
      for (let i = -reach; i <= reach; i++) {
        for (let j = -reach; j <= reach; j++) {
          if (i !== 0 || j !== 0) out.push([1, 0, 0, 1, i * stepX, j * stepY]);
        }
      }
      return out;
    }
  }
}

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Dashed guides drawn over the canvas (never exported): mirror lines for mirror modes,
 * spokes between copies for turning modes, a grid for tile.
 */
export function symmetryGuideLines(
  mode: SymmetryMode,
  count: number | undefined,
  width: number,
  height: number,
): GuideLine[] {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.hypot(width, height);
  const n = clampCount(count);
  const fullLine = (angle: number): GuideLine => ({
    x1: cx - Math.cos(angle) * r,
    y1: cy - Math.sin(angle) * r,
    x2: cx + Math.cos(angle) * r,
    y2: cy + Math.sin(angle) * r,
  });
  const ray = (angle: number): GuideLine => ({
    x1: cx,
    y1: cy,
    x2: cx + Math.cos(angle) * r,
    y2: cy + Math.sin(angle) * r,
  });
  switch (mode) {
    case "none":
      return [];
    case "mirror":
      return [fullLine(Math.PI / 2)];
    case "quad":
      return [fullLine(0), fullLine(Math.PI / 2)];
    case "diagonal":
      return [fullLine(Math.PI / 4), fullLine((3 * Math.PI) / 4)];
    case "radial":
      return range(n).map((k) => ray(-Math.PI / 2 + (2 * Math.PI * k) / n));
    case "spiral":
      // One spoke per copy, each shorter, tracing the inward spiral.
      return range(n).map((k) => {
        const angle = -Math.PI / 2 + SPIRAL_STEP * k;
        const reach = (Math.min(width, height) / 2) * SPIRAL_SHRINK ** k;
        return {
          x1: cx,
          y1: cy,
          x2: cx + Math.cos(angle) * reach,
          y2: cy + Math.sin(angle) * reach,
        };
      });
    case "kaleidoscope":
      // Mirror axes of a turn-and-flip pattern sit at half the turning angle.
      return range(n).map((k) => fullLine(Math.PI / 2 + (Math.PI * k) / n));
    case "bloom":
      return range(n * 2).map((k) => ray(-Math.PI / 2 + (Math.PI * k) / n));
    case "tunnel": {
      const arm = Math.min(width, height) * 0.04;
      return [
        { x1: cx - arm, y1: cy, x2: cx + arm, y2: cy },
        { x1: cx, y1: cy - arm, x2: cx, y2: cy + arm },
      ];
    }
    case "echo": {
      const steps = (n - 1) * ECHO_STEP;
      return [{ x1: 0, y1: 0, x2: width * steps, y2: height * steps }];
    }
    case "quilt":
    case "tile": {
      const lines: GuideLine[] = [];
      for (let k = 1; k < TILE_DIVISIONS; k++) {
        const x = (width * k) / TILE_DIVISIONS;
        const y = (height * k) / TILE_DIVISIONS;
        lines.push({ x1: x, y1: 0, x2: x, y2: height }, { x1: 0, y1: y, x2: width, y2: y });
      }
      return lines;
    }
  }
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Returns the matrix that applies `second` first, then `first` (first × second). */
export function multiply(first: Matrix, second: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Turn by `angle` (and scale by `scale`) around (cx, cy). */
function turnAbout(cx: number, cy: number, angle: number, scale = 1): Matrix {
  const cos = Math.cos(angle) * scale;
  const sin = Math.sin(angle) * scale;
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
