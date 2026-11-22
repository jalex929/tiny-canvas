import type { SymmetryMode } from "./types";

/** 2D affine matrix in canvas order: [a, b, c, d, e, f]. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const SYMMETRY_INFO: Record<SymmetryMode, { label: string; description: string }> = {
  none: { label: "Off", description: "No symmetry" },
  mirror: { label: "Mirror", description: "Mirrored left and right" },
  quad: { label: "Mirror ×4", description: "Mirrored left-right and top-bottom, 4 copies" },
  radial: { label: "Radial ×6", description: "Turned around the center, 6 copies" },
  kaleidoscope: {
    label: "Kaleidoscope",
    description: "Turned and mirrored around the center, 12 copies",
  },
};

/**
 * Guide lines for each mode, as angles (radians) of lines through the center.
 * Mirror lines for mirror modes; spokes between copies for radial modes.
 */
export function symmetryGuides(mode: SymmetryMode): number[] {
  switch (mode) {
    case "none":
      return [];
    case "mirror":
      return [Math.PI / 2];
    case "quad":
      return [0, Math.PI / 2];
    case "radial":
      return [0, 1, 2].map((k) => (k * Math.PI) / 3 + Math.PI / 2);
    case "kaleidoscope":
      return [0, 1, 2, 3, 4, 5].map((k) => (k * Math.PI) / 6 + Math.PI / 2);
  }
}

/** Every copy a stroke is drawn with. The first entry is always the original. */
export function symmetryMatrices(mode: SymmetryMode, width: number, height: number): Matrix[] {
  const cx = width / 2;
  const cy = height / 2;
  const flipX: Matrix = [-1, 0, 0, 1, 2 * cx, 0];
  const flipY: Matrix = [1, 0, 0, -1, 0, 2 * cy];
  switch (mode) {
    case "none":
      return [IDENTITY];
    case "mirror":
      return [IDENTITY, flipX];
    case "quad":
      return [IDENTITY, flipX, flipY, multiply(flipX, flipY)];
    case "radial":
      return range(6).map((k) => rotationAbout(cx, cy, (2 * Math.PI * k) / 6));
    case "kaleidoscope":
      return range(6).flatMap((k) => {
        const rotation = rotationAbout(cx, cy, (2 * Math.PI * k) / 6);
        return [rotation, multiply(rotation, flipX)];
      });
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

function rotationAbout(cx: number, cy: number, angle: number): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
