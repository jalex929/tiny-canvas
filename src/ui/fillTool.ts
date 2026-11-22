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

  const mask = dilate(floodMask(pixels, x, y, tolerance), canvas.width, canvas.height, 1);
  const encoded = encodeRuns(mask, canvas.width, canvas.height);
  return maskArea(encoded) === 0 ? { kind: "outside" } : { kind: "filled", mask: encoded };
}
