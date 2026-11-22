import { useEffect, useRef } from "react";
import { BRUSHES } from "../engine/brushes";
import { drawStroke } from "../engine/render";
import type { BrushId, Point, Stroke } from "../engine/types";

const WIDTH = 400;
const HEIGHT = 96;
const CSS_WIDTH = 88;

/** A wavy sample line in a 400 × 96 box. */
const SQUIGGLE: Point[] = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  // Pressure builds along the sample so the tiles show how brushes respond to a stylus.
  return { x: 30 + t * 340, y: 48 + Math.sin(t * Math.PI * 2.2) * 24, p: 0.55 + t * 0.45 };
});

/** Draws a sample of the brush with the real engine, so the tile shows what you'll get. */
export function BrushPreview({
  brush,
  color,
  options,
}: {
  brush: BrushId;
  color: string;
  options?: Record<string, number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CSS_WIDTH * dpr);
    canvas.height = Math.round(((CSS_WIDTH * HEIGHT) / WIDTH) * dpr);
    const scale = canvas.width / WIDTH;
    const scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = canvas.width;
    scratchCanvas.height = canvas.height;
    const scratchCtx = scratchCanvas.getContext("2d");
    if (!scratchCtx) return;
    const target = { ctx, scale };
    const scratch = { ctx: scratchCtx, scale };
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sample = (overrides: Partial<Stroke>): Stroke => ({
      id: "preview",
      brush,
      color,
      size: Math.min(BRUSHES[brush].defaultSize, 30),
      opacity: 1,
      symmetry: "none",
      seed: 11,
      points: SQUIGGLE,
      ...(options ? { options } : {}),
      ...overrides,
    });

    if (brush === "eraser") {
      drawStroke(target, sample({ brush: "marker", color: "#b9b7cc", size: 44 }), scratch);
      const diagonal: Point[] = [
        { x: 140, y: 6, p: 0.5 },
        { x: 260, y: 90, p: 0.5 },
      ];
      drawStroke(target, sample({ size: 26, points: diagonal }), scratch);
    } else {
      drawStroke(target, sample({}), scratch);
    }
  }, [brush, color, options]);

  return <canvas ref={ref} className="brush-preview" aria-hidden="true" />;
}
