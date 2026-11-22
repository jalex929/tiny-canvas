import { useEffect, useRef } from "react";
import { drawStroke } from "../engine/render";
import { symmetryGuideLines } from "../engine/symmetry";
import { DOC_HEIGHT, DOC_WIDTH, type Point, type SymmetryMode } from "../engine/types";

const CSS_WIDTH = 64;

/**
 * A small hook shape in the upper-left area. It is deliberately lopsided, so a mirrored copy
 * looks different from a rotated one.
 */
const MOTIF: Point[] = Array.from({ length: 24 }, (_, i) => {
  const t = i / 23;
  const angle = Math.PI * 1.15 * t;
  const radius = 230 - t * 150;
  return { x: 520 + Math.cos(angle) * radius * 0.9, y: 380 - Math.sin(angle) * radius, p: 0.5 };
});

/** Draws what a symmetry mode does, using the real engine. */
export function SymmetryPreview({
  mode,
  ink,
  count,
}: {
  mode: SymmetryMode;
  ink: string;
  count?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CSS_WIDTH * dpr);
    canvas.height = Math.round(((CSS_WIDTH * DOC_HEIGHT) / DOC_WIDTH) * dpr);
    const scale = canvas.width / DOC_WIDTH;
    const scratch = document.createElement("canvas").getContext("2d");
    if (!scratch) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror lines / spokes, dashed, so the axis is visible as well as the copies.
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const line of symmetryGuideLines(mode, count, DOC_WIDTH, DOC_HEIGHT)) {
      ctx.beginPath();
      ctx.moveTo(line.x1 * scale, line.y1 * scale);
      ctx.lineTo(line.x2 * scale, line.y2 * scale);
      ctx.stroke();
    }
    ctx.restore();

    drawStroke(
      { ctx, scale },
      {
        id: "symmetry-preview",
        brush: "pen",
        color: ink,
        size: 70,
        opacity: 1,
        symmetry: mode,
        ...(count ? { symmetryCount: count } : {}),
        seed: 1,
        points: MOTIF,
      },
      { ctx: scratch, scale },
    );
  }, [mode, ink, count]);

  return <canvas ref={ref} className="symmetry-preview" aria-hidden="true" />;
}
