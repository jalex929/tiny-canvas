/**
 * Paint bucket. A fill is stored as a mask at document resolution, encoded as runs, so it
 * renders identically at any zoom, survives undo and saves with the drawing.
 */

export interface FillMask {
  width: number;
  height: number;
  /** Flat list of [row, startColumn, length] triples. */
  runs: number[];
}

export const FILL_TOLERANCES = ["exact", "normal", "loose"] as const;
export type FillTolerance = (typeof FILL_TOLERANCES)[number];
export const FILL_TOLERANCE_INFO: Record<FillTolerance, { label: string; value: number }> = {
  exact: { label: "Exact", value: 8 },
  normal: { label: "Normal", value: 48 },
  loose: { label: "Loose", value: 110 },
};

interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array | number[];
}

/**
 * Marks every pixel connected to (x, y) whose color is within `tolerance` of the color
 * there (largest channel difference, 0–255). Scanline flood fill: no recursion, so large
 * areas can't overflow the stack.
 */
export function floodMask(pixels: Pixels, x: number, y: number, tolerance: number): Uint8Array {
  const { width, height, data } = pixels;
  const mask = new Uint8Array(width * height);
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return mask;
  const seed = (sy * width + sx) * 4;
  const r0 = data[seed]!;
  const g0 = data[seed + 1]!;
  const b0 = data[seed + 2]!;
  const a0 = data[seed + 3]!;
  const matches = (i: number) => {
    const o = i * 4;
    return (
      Math.abs(data[o]! - r0) <= tolerance &&
      Math.abs(data[o + 1]! - g0) <= tolerance &&
      Math.abs(data[o + 2]! - b0) <= tolerance &&
      Math.abs(data[o + 3]! - a0) <= tolerance
    );
  };

  const stack: number[] = [sx, sy];
  while (stack.length) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    let left = px;
    const row = py * width;
    if (mask[row + left] || !matches(row + left)) continue;
    while (left > 0 && !mask[row + left - 1] && matches(row + left - 1)) left--;
    let right = px;
    while (right < width - 1 && !mask[row + right + 1] && matches(row + right + 1)) right++;
    for (let cx = left; cx <= right; cx++) mask[row + cx] = 1;
    // Queue the start of every matching stretch in the rows above and below.
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let inside = false;
      for (let cx = left; cx <= right; cx++) {
        const open = !mask[nrow + cx] && matches(nrow + cx);
        if (open && !inside) stack.push(cx, ny);
        inside = open;
      }
    }
  }
  return mask;
}

/** Grows the mask by `radius` pixels, so the fill tucks under anti-aliased line edges. */
export function dilate(mask: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  let current = mask;
  for (let pass = 0; pass < radius; pass++) {
    const next = current.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (current[i]) continue;
        if (
          (x > 0 && current[i - 1]) ||
          (x < width - 1 && current[i + 1]) ||
          (y > 0 && current[i - width]) ||
          (y < height - 1 && current[i + width])
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

export function encodeRuns(mask: Uint8Array, width: number, height: number): FillMask {
  const runs: number[] = [];
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!mask[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && mask[y * width + x]) x++;
      runs.push(y, start, x - start);
    }
  }
  return { width, height, runs };
}

export function decodeRuns(fill: FillMask): Uint8Array {
  const mask = new Uint8Array(fill.width * fill.height);
  for (let i = 0; i + 2 < fill.runs.length; i += 3) {
    const y = fill.runs[i]!;
    const start = fill.runs[i + 1]!;
    const length = fill.runs[i + 2]!;
    if (y < 0 || y >= fill.height) continue;
    const from = y * fill.width + Math.max(0, start);
    const to = y * fill.width + Math.min(fill.width, start + length);
    mask.fill(1, from, Math.max(from, to));
  }
  return mask;
}

/** Number of filled pixels (used to skip fills that would change nothing). */
export function maskArea(fill: FillMask): number {
  let area = 0;
  for (let i = 2; i < fill.runs.length; i += 3) area += fill.runs[i]!;
  return area;
}
