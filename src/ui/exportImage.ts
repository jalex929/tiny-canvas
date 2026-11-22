import type { Scene } from "../engine/history";
import { drawStrokes } from "../engine/render";

export type ImageFormat = "png" | "jpeg";

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't create a drawing surface.");
  return { canvas, ctx };
}

/**
 * Renders the scene from its strokes at any width. Strokes go on their own layer so the
 * eraser removes ink without punching holes in the background.
 */
export function renderScene(
  scene: Scene,
  width: number,
  options: { transparent?: boolean } = {},
): HTMLCanvasElement {
  const scale = width / scene.width;
  const height = scene.height * scale;
  const out = makeCanvas(width, height);
  const ink = makeCanvas(width, height);
  const scratch = makeCanvas(width, height);
  drawStrokes({ ctx: ink.ctx, scale }, scene.strokes, { ctx: scratch.ctx, scale });
  if (!options.transparent) {
    out.ctx.fillStyle = scene.background;
    out.ctx.fillRect(0, 0, out.canvas.width, out.canvas.height);
  }
  out.ctx.drawImage(ink.canvas, 0, 0);
  return out.canvas;
}

/** Export is twice the document size (e.g. 3200 × 2400) so prints and zooms stay crisp. */
export const EXPORT_SCALE = 2;

export function exportSize(scene: { width: number; height: number }) {
  return { width: scene.width * EXPORT_SCALE, height: scene.height * EXPORT_SCALE };
}

export async function downloadImage(
  scene: Scene,
  format: ImageFormat,
  title: string,
  transparent = false,
): Promise<void> {
  // JPG has no transparency, so it always gets the background.
  const canvas = renderScene(scene, exportSize(scene).width, {
    transparent: format === "png" && transparent,
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, `image/${format}`, 0.92),
  );
  if (!blob) throw new Error("The image couldn't be created.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileSlug(title)}.${format === "jpeg" ? "jpg" : "png"}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function thumbnail(scene: Scene): string {
  // Fit the longer side to 320px whatever the shape.
  const width = scene.width >= scene.height ? 320 : (320 * scene.width) / scene.height;
  return renderScene(scene, width).toDataURL("image/jpeg", 0.8);
}

export function fileSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "tiny-canvas-drawing";
}
