import { BRUSHES } from "./brushes";
import { createRandom } from "./random";
import { applyMatrix, symmetryMatrices, type Matrix } from "./symmetry";
import { DOC_HEIGHT, DOC_WIDTH, type Stroke } from "./types";

/**
 * A 2D context, how many device pixels make one document pixel, and where the document's
 * top-left corner sits on that context in device pixels (non-zero when zoomed or panned).
 */
export interface RenderTarget {
  ctx: CanvasRenderingContext2D;
  scale: number;
  originX?: number;
  originY?: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws one stroke, with every symmetry copy.
 *
 * Strokes that are see-through or blend (marker) are painted on a scratch layer first,
 * then composited once. Otherwise overlapping parts of a single stroke, and symmetry
 * copies that cross each other, would build up darker patches.
 */
export function drawStroke(target: RenderTarget, stroke: Stroke, scratch: RenderTarget): void {
  const brush = BRUSHES[stroke.brush];
  const matrices = symmetryMatrices(stroke.symmetry, DOC_WIDTH, DOC_HEIGHT);
  const isolate = stroke.opacity < 1 || brush.composite === "multiply";

  if (!isolate) {
    target.ctx.save();
    target.ctx.globalCompositeOperation = brush.composite;
    paintCopies(target, stroke, matrices);
    target.ctx.restore();
    return;
  }

  const box = strokeBounds(stroke, matrices, target, target.ctx.canvas);
  if (!box) return;
  const layer = scratch.ctx;
  layer.save();
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(box.x, box.y, box.w, box.h);
  layer.beginPath();
  layer.rect(box.x, box.y, box.w, box.h);
  layer.clip();
  paintCopies({ ...target, ctx: layer }, stroke, matrices);
  layer.restore();

  const ctx = target.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = stroke.opacity;
  ctx.globalCompositeOperation = brush.composite;
  ctx.drawImage(layer.canvas, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
  ctx.restore();
}

export function drawStrokes(
  target: RenderTarget,
  strokes: readonly Stroke[],
  scratch: RenderTarget,
) {
  for (const stroke of strokes) drawStroke(target, stroke, scratch);
}

function paintCopies(target: RenderTarget, stroke: Stroke, matrices: Matrix[]) {
  const brush = BRUSHES[stroke.brush];
  for (const m of matrices) {
    target.ctx.save();
    target.ctx.setTransform(
      target.scale,
      0,
      0,
      target.scale,
      target.originX ?? 0,
      target.originY ?? 0,
    );
    target.ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    // Same seed for every copy, so mirrored halves match exactly.
    brush.paint({
      ctx: target.ctx,
      stroke,
      random: createRandom(stroke.seed),
      pixelScale: target.scale,
    });
    target.ctx.restore();
  }
}

/** Device-pixel rectangle that safely contains the stroke, its copies and its glow. */
export function strokeBounds(
  stroke: Stroke,
  matrices: Matrix[],
  target: { scale: number; originX?: number; originY?: number },
  canvas: { width: number; height: number },
): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of matrices) {
    for (const point of stroke.points) {
      const { x, y } = applyMatrix(m, point.x, point.y);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return null;
  const pad = stroke.size * 2.5 + 4;
  const { scale, originX = 0, originY = 0 } = target;
  const x = Math.max(0, Math.floor((minX - pad) * scale + originX));
  const y = Math.max(0, Math.floor((minY - pad) * scale + originY));
  const right = Math.min(canvas.width, Math.ceil((maxX + pad) * scale + originX));
  const bottom = Math.min(canvas.height, Math.ceil((maxY + pad) * scale + originY));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}
