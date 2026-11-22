import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex, normalizeHex, tint } from "./color";
import { resample, smoothSegments } from "./geometry";
import { createRandom } from "./random";
import { drawStroke, strokeBounds } from "./render";
import { applyMatrix, symmetryMatrices } from "./symmetry";
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
    expect(SYMMETRY_MODES.map((m) => copies(m).length)).toEqual([1, 2, 4, 6, 12]);
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
  it.each(BRUSH_IDS)("%s brush draws something and redraws identically", (brush) => {
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
  });

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
    const box = strokeBounds(stroke, symmetryMatrices("mirror", DOC_WIDTH, DOC_HEIGHT), 1, {
      width: DOC_WIDTH,
      height: DOC_HEIGHT,
    })!;
    expect(box.x).toBeLessThanOrEqual(100);
    expect(box.x + box.w).toBeGreaterThanOrEqual(DOC_WIDTH - 100);
    expect(box.x + box.w).toBeLessThanOrEqual(DOC_WIDTH);
  });
});
