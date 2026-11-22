import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex, normalizeHex, tint } from "./color";
import { resample, smoothSegments } from "./geometry";
import { createRandom } from "./random";
import { drawStroke, paintStrokeRange, strokeBounds } from "./render";
import { applyMatrix, symmetryGuideLines, symmetryMatrices } from "./symmetry";
import { BRUSH_IDS, DOC_HEIGHT, DOC_WIDTH, SYMMETRY_MODES, type Stroke } from "./types";

describe("seeded random", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(Array.from({ length: 5 }, createRandom(43))).not.toEqual(seqA);
  });
});

describe("symmetry", () => {
  const copies = (mode: (typeof SYMMETRY_MODES)[number]) =>
    symmetryMatrices(mode, DOC_WIDTH, DOC_HEIGHT);

  it("produces the expected number of copies, original first", () => {
    expect(SYMMETRY_MODES.map((m) => copies(m).length)).toEqual([
      1, 2, 4, 4, 6, 12, 6, 6, 12, 25, 25, 6,
    ]);
    expect(symmetryMatrices("radial", DOC_WIDTH, DOC_HEIGHT, 9)).toHaveLength(9);
    expect(symmetryMatrices("kaleidoscope", DOC_WIDTH, DOC_HEIGHT, 3)).toHaveLength(6);
    for (const mode of SYMMETRY_MODES) {
      expect(applyMatrix(copies(mode)[0]!, 100, 200)).toEqual({ x: 100, y: 200 });
    }
  });

  it("mirrors across the vertical center line", () => {
    const [, mirror] = copies("mirror");
    expect(applyMatrix(mirror!, 100, 200)).toEqual({ x: DOC_WIDTH - 100, y: 200 });
  });

  it("radial copies keep their distance from the center", () => {
    const cx = DOC_WIDTH / 2;
    const cy = DOC_HEIGHT / 2;
    for (const m of copies("kaleidoscope")) {
      const p = applyMatrix(m, cx + 300, cy - 40);
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(Math.hypot(300, 40), 6);
    }
  });
});

describe("geometry", () => {
  const pts = [
    { x: 0, y: 0, p: 0.5 },
    { x: 10, y: 0, p: 0.5 },
    { x: 20, y: 0, p: 1 },
  ];

  it("smooths through midpoints and ends exactly on the last sample", () => {
    const segments = smoothSegments(pts);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.from).toEqual(pts[0]);
    expect(segments[0]!.to).toEqual({ x: 15, y: 0, p: 0.75 });
    expect(segments[1]!.to).toEqual(pts[2]);
    expect(smoothSegments(pts.slice(0, 1))).toEqual([]);
  });

  it("resamples at even spacing across segment boundaries", () => {
    const out = resample(pts, 4);
    expect(out.map((p) => p.x)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(out[4]!.p).toBeCloseTo(0.8);
  });
});

describe("color", () => {
  it("normalizes hex input", () => {
    expect(normalizeHex("FFD23F")).toBe("#ffd23f");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("round-trips through HSL", () => {
    for (const hex of ["#000052", "#ffd23f", "#ff6fb5", "#2ec4b6", "#808080"]) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });

  it("tints toward white", () => {
    expect(tint("#000000", 0.5)).toBe("#808080");
    expect(tint("#123456", 1)).toBe("#ffffff");
  });
});

/** A context that records what was drawn, standing in for a real canvas. */
function recordingContext() {
  const calls: string[] = [];
  const ctx = new Proxy(
    { canvas: { width: 3200, height: 2400 } },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) =>
          calls.push(
            `${String(key)}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : typeof a)).join(",")})`,
          );
      },
      set(_target, key, value) {
        calls.push(
          `${String(key)}=${typeof value === "number" ? value.toFixed(3) : String(value)}`,
        );
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const sampleStroke = (brush: Stroke["brush"], overrides: Partial<Stroke> = {}): Stroke => ({
  id: "s",
  brush,
  color: "#2ec4b6",
  size: 24,
  opacity: 1,
  symmetry: "none",
  seed: 7,
  points: [
    { x: 100, y: 100, p: 0.5 },
    { x: 160, y: 130, p: 0.6 },
    { x: 240, y: 110, p: 0.4 },
    { x: 300, y: 200, p: 0.5 },
  ],
  ...overrides,
});

describe("rendering", () => {
  it.each(BRUSH_IDS.filter((b) => b !== "fill"))(
    "%s brush draws something and redraws identically",
    (brush) => {
      const render = () => {
        const target = recordingContext();
        const scratch = recordingContext();
        drawStroke({ ctx: target.ctx, scale: 2 }, sampleStroke(brush), {
          ctx: scratch.ctx,
          scale: 2,
        });
        return [...target.calls, "|", ...scratch.calls];
      };
      const first = render();
      expect(first.length).toBeGreaterThan(5);
      expect(render()).toEqual(first);
    },
  );

  it.each(BRUSH_IDS.filter((b) => b !== "fill"))(
    "%s brush painted in pieces matches painting it all at once",
    (brush) => {
      // Strip style settings; compare only what gets drawn, in order.
      const shapes = (calls: string[]) =>
        calls.filter((c) =>
          /^(moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|fillRect|translate|rotate|scale)\(/.test(
            c,
          ),
        );
      const frame = { dx: 0, dy: 0, width: DOC_WIDTH, height: DOC_HEIGHT };
      const stroke = sampleStroke(brush, {
        points: Array.from({ length: 40 }, (_, i) => ({
          x: 100 + i * 9,
          y: 200 + Math.sin(i / 4) * 50,
          p: 0.5 + (i % 5) / 10,
        })),
      });
      const whole = recordingContext();
      const units = paintStrokeRange({ ctx: whole.ctx, scale: 1 }, stroke, frame, 0, Infinity);
      const pieces = recordingContext();
      const cut1 = Math.floor(units / 3);
      const cut2 = Math.floor((units * 2) / 3);
      for (const [from, until] of [
        [0, cut1],
        [cut1, cut2],
        [cut2, Infinity],
      ] as const) {
        paintStrokeRange({ ctx: pieces.ctx, scale: 1 }, stroke, frame, from, until);
      }
      expect(units).toBeGreaterThan(3);
      expect(shapes(pieces.calls)).toEqual(shapes(whole.calls));
    },
  );

  it("composites see-through strokes once, so overlaps don't darken", () => {
    const target = recordingContext();
    const scratch = recordingContext();
    drawStroke(
      { ctx: target.ctx, scale: 1 },
      sampleStroke("pen", { opacity: 0.4, symmetry: "quad" }),
      { ctx: scratch.ctx, scale: 1 },
    );
    expect(target.calls.filter((c) => c.startsWith("drawImage"))).toHaveLength(1);
    expect(target.calls).toContain("globalAlpha=0.400");
    expect(target.calls.some((c) => c.startsWith("stroke("))).toBe(false);
  });

  it("offsets the drawing when the view is panned", () => {
    const target = recordingContext();
    drawStroke({ ctx: target.ctx, scale: 2, originX: -300, originY: 40 }, sampleStroke("pen"), {
      ctx: recordingContext().ctx,
      scale: 2,
    });
    expect(target.calls).toContain("setTransform(2.000,0.000,0.000,2.000,-300.000,40.000)");
  });

  it("erases with destination-out", () => {
    const target = recordingContext();
    drawStroke({ ctx: target.ctx, scale: 1 }, sampleStroke("eraser"), {
      ctx: recordingContext().ctx,
      scale: 1,
    });
    expect(target.calls).toContain("globalCompositeOperation=destination-out");
  });

  it("bounds include every symmetry copy and stay inside the canvas", () => {
    const stroke = sampleStroke("pen", { symmetry: "mirror" });
    const box = strokeBounds(
      stroke,
      symmetryMatrices("mirror", DOC_WIDTH, DOC_HEIGHT),
      { scale: 1 },
      {
        width: DOC_WIDTH,
        height: DOC_HEIGHT,
      },
    )!;
    expect(box.x).toBeLessThanOrEqual(100);
    expect(box.x + box.w).toBeGreaterThanOrEqual(DOC_WIDTH - 100);
    expect(box.x + box.w).toBeLessThanOrEqual(DOC_WIDTH);
  });
});

describe("new symmetry modes", () => {
  it("spiral copies shrink toward the center", () => {
    const [, second, third] = symmetryMatrices("spiral", DOC_WIDTH, DOC_HEIGHT, 6);
    const cx = DOC_WIDTH / 2;
    const cy = DOC_HEIGHT / 2;
    const dist = (m: typeof second) => {
      const p = applyMatrix(m!, cx + 400, cy);
      return Math.hypot(p.x - cx, p.y - cy);
    };
    expect(dist(second)).toBeCloseTo(400 * 0.85);
    expect(dist(third)).toBeCloseTo(400 * 0.85 * 0.85);
  });

  it("spiral is not radial: copies turn a little each, so they trail instead of ringing", () => {
    const spiral = symmetryMatrices("spiral", DOC_WIDTH, DOC_HEIGHT, 6);
    const radial = symmetryMatrices("radial", DOC_WIDTH, DOC_HEIGHT, 6);
    const angleOf = (m: (typeof spiral)[number]) => {
      const p = applyMatrix(m, DOC_WIDTH / 2 + 400, DOC_HEIGHT / 2);
      return Math.atan2(p.y - DOC_HEIGHT / 2, p.x - DOC_WIDTH / 2);
    };
    expect(angleOf(spiral[1]!)).toBeCloseTo(Math.PI / 6);
    expect(angleOf(radial[1]!)).toBeCloseTo(Math.PI / 3);
  });

  it("tile repeats a mark across the whole canvas", () => {
    const copies = symmetryMatrices("tile", 1500, 1200).map((m) => applyMatrix(m, 100, 100));
    expect(copies).toContainEqual({ x: 600, y: 500 });
    expect(copies).toContainEqual({ x: 1100, y: 900 });
  });

  it("diagonal mirrors across the 45° lines through the center", () => {
    const [, down, up, both] = symmetryMatrices("diagonal", DOC_WIDTH, DOC_HEIGHT);
    const cx = DOC_WIDTH / 2;
    const cy = DOC_HEIGHT / 2;
    expect(applyMatrix(down!, cx + 100, cy + 30)).toEqual({ x: cx + 30, y: cy + 100 });
    expect(applyMatrix(up!, cx + 100, cy + 30)).toEqual({ x: cx - 30, y: cy - 100 });
    expect(applyMatrix(both!, cx + 100, cy + 30)).toEqual({ x: cx - 100, y: cy - 30 });
  });

  it("tunnel copies shrink straight in without turning", () => {
    const [, second] = symmetryMatrices("tunnel", DOC_WIDTH, DOC_HEIGHT, 6);
    const p = applyMatrix(second!, DOC_WIDTH / 2 + 400, DOC_HEIGHT / 2);
    expect(p.y).toBeCloseTo(DOC_HEIGHT / 2);
    expect(p.x - DOC_WIDTH / 2).toBeCloseTo(400 * 0.78);
  });

  it("bloom makes an inner ring of smaller petals between the outer ones", () => {
    const m = symmetryMatrices("bloom", DOC_WIDTH, DOC_HEIGHT, 6);
    const inner = applyMatrix(m[1]!, DOC_WIDTH / 2 + 400, DOC_HEIGHT / 2);
    const d = Math.hypot(inner.x - DOC_WIDTH / 2, inner.y - DOC_HEIGHT / 2);
    expect(d).toBeCloseTo(400 * 0.55);
    expect(Math.atan2(inner.y - DOC_HEIGHT / 2, inner.x - DOC_WIDTH / 2)).toBeCloseTo(Math.PI / 6);
  });

  it("quilt mirrors neighboring squares", () => {
    const copies = symmetryMatrices("quilt", 1500, 1200).map((m) => applyMatrix(m, 100, 100));
    expect(copies[0]).toEqual({ x: 100, y: 100 });
    expect(copies).toContainEqual({ x: 900, y: 100 }); // mirrored into the next column
    expect(copies).toContainEqual({ x: 1100, y: 900 }); // plain copy two over and two down
  });

  it("echo steps copies diagonally", () => {
    const pts = symmetryMatrices("echo", 1000, 1000, 3).map((m) => applyMatrix(m, 100, 100));
    expect(pts).toEqual([
      { x: 100, y: 100 },
      { x: 135, y: 135 },
      { x: 170, y: 170 },
    ]);
  });

  it("guides match the mode", () => {
    expect(symmetryGuideLines("radial", 8, 1600, 1200)).toHaveLength(8);
    expect(symmetryGuideLines("tile", 6, 1500, 1200)).toHaveLength(4);
    expect(symmetryGuideLines("none", 6, 1600, 1200)).toEqual([]);
  });

  it("fill brush fills a closed outline in one unit", () => {
    const target = recordingContext();
    drawStroke(
      { ctx: target.ctx, scale: 1 },
      sampleStroke("fill", {
        points: [
          { x: 0, y: 0, p: 1 },
          { x: 100, y: 0, p: 1 },
          { x: 50, y: 80, p: 1 },
        ],
      }),
      { ctx: recordingContext().ctx, scale: 1 },
    );
    expect(target.calls).toContain("closePath()");
    expect(target.calls).toContain("fill()");
  });
});
