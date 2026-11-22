import { dilate, encodeRuns, floodMask, maskArea, type FillMask } from "../engine/fill";
import type { Scene } from "../engine/history";
import { renderScene } from "./exportImage";

export type FillResult =
  { kind: "filled"; mask: FillMask } | { kind: "same-color" } | { kind: "outside" };

/**
 * Works out what a tap with the fill tool covers: renders the drawing as it looks now
 * (paper plus ink) at document resolution, flood-fills from the tapped pixel, then grows
 * the area by a pixel so it tucks under the soft edges of lines instead of leaving a halo.
 */
export function computeFill(
  scene: Scene,
  x: number,
  y: number,
  color: string,
  tolerance: number,
  /** How far (document px) a tap may miss a thin line and still recolor it. */
  slop = 6,
): FillResult {
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return { kind: "outside" };
  const canvas = renderScene(scene, scene.width);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { kind: "outside" };
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const i = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const target = parseInt(color.slice(1), 16);
  const sameColor =
    Math.abs(pixels.data[i]! - ((target >> 16) & 255)) < 3 &&
    Math.abs(pixels.data[i + 1]! - ((target >> 8) & 255)) < 3 &&
    Math.abs(pixels.data[i + 2]! - (target & 255)) < 3;
  if (sameColor) return { kind: "same-color" };

  let raw = floodMask(pixels, x, y, tolerance);
  if (countSet(raw) < TINY_AREA) {
    // Landed on the soft edge of a line: aim for the solid line nearby instead.
    const seed = nearestContrasting(pixels, x, y, slop);
    if (seed) {
      const better = floodMask(pixels, seed.x, seed.y, tolerance);
      if (countSet(better) > countSet(raw)) raw = better;
    }
  }
  const mask = dilate(raw, canvas.width, canvas.height, 1);
  const encoded = encodeRuns(mask, canvas.width, canvas.height);
  return maskArea(encoded) === 0 ? { kind: "outside" } : { kind: "filled", mask: encoded };
}

/** Fewer filled pixels than this means the tap hit a line's anti-aliased edge. */
const TINY_AREA = 40;

function countSet(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i]!;
  return n;
}

/**
 * The closest pixel within `radius` whose color is clearly different from the tapped one:
 * the solid middle of the line whose edge was tapped.
 */
function nearestContrasting(pixels: ImageData, x: number, y: number, radius: number) {
  const { width, height, data } = pixels;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const at = (px: number, py: number) => (py * width + px) * 4;
  const seed = at(x0, y0);
  let best: { x: number; y: number; d: number } | null = null;
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > radius * radius || (best && d >= best.d)) continue;
      const px = x0 + dx;
      const py = y0 + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = at(px, py);
      const diff = Math.max(
        Math.abs(data[i]! - data[seed]!),
        Math.abs(data[i + 1]! - data[seed + 1]!),
        Math.abs(data[i + 2]! - data[seed + 2]!),
      );
      if (diff > 90) best = { x: px, y: py, d };
    }
  }
  return best;
}
