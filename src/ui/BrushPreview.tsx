import { useEffect, useRef } from "react";
import { BRUSHES } from "../engine/brushes";
import { drawStroke } from "../engine/render";
import type { BrushId, Point, Stroke } from "../engine/types";

const WIDTH = 400;
const HEIGHT = 140;
const CSS_WIDTH = 88;

/** A wavy sample line in a 400 × 140 box. */
const SQUIGGLE: Point[] = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  return { x: 30 + t * 340, y: 70 + Math.sin(t * Math.PI * 2.2) * 38, p: 0.35 + t * 0.4 };
});

/** Draws a sample of the brush with the real engine, so the tile shows what you'll get. */
export function BrushPreview({ brush, color }: { brush: BrushId; color: string }) {
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
      size: Math.min(BRUSHES[brush].defaultSize, 40),
      opacity: 1,
      symmetry: "none",
      seed: 11,
      points: SQUIGGLE,
      ...overrides,
    });

    if (brush === "eraser") {
      drawStroke(target, sample({ brush: "marker", color: "#b9b7cc", size: 60 }), scratch);
      const diagonal: Point[] = [
        { x: 120, y: 10, p: 0.5 },
        { x: 280, y: 130, p: 0.5 },
      ];
      drawStroke(target, sample({ size: 34, points: diagonal }), scratch);
    } else {
      drawStroke(target, sample({}), scratch);
    }
  }, [brush, color]);

  return <canvas ref={ref} className="brush-preview" aria-hidden="true" />;
}
