import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BrowserDrawingStore } from "./browserStore";
import { compactStroke, parseDrawing, type Drawing } from "./drawing";

const drawing = (id: string, updatedAt: number): Drawing => ({
  id,
  title: `Drawing ${id}`,
  createdAt: 1,
  updatedAt,
  thumbnail: "data:image/png;base64,AAAA",
  width: 1400,
  height: 1400,
  actions: [
    { type: "background", color: "#000052" },
    {
      type: "stroke",
      stroke: {
        id: "s1",
        brush: "neon",
        color: "#ffd23f",
        size: 12,
        opacity: 1,
        symmetry: "radial",
        seed: 9,
        points: [{ x: 1, y: 2, p: 0.5 }],
        options: { glow: 1.5 },
      },
    },
    { type: "canvas", width: 1920, height: 1080 },
  ],
});

describe("BrowserDrawingStore", () => {
  it("saves, lists newest first, reopens and deletes drawings", async () => {
    const store = new BrowserDrawingStore(new IDBFactory());
    await store.save(drawing("a", 10));
    await store.save(drawing("b", 20));

    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual(["b", "a"]);
    expect(list[0]).not.toHaveProperty("actions");

    expect(await store.get("a")).toEqual(drawing("a", 10));

    await store.save({ ...drawing("a", 30), title: "Renamed" });
    expect((await store.list()).map((d) => [d.id, d.title])).toEqual([
      ["a", "Renamed"],
      ["b", "Drawing b"],
    ]);

    await store.remove("a");
    expect(await store.get("a")).toBeNull();
    expect((await store.list()).map((d) => d.id)).toEqual(["b"]);
  });
});

describe("parseDrawing", () => {
  it("accepts a valid drawing", () => {
    expect(parseDrawing(drawing("a", 1))).toEqual(drawing("a", 1));
  });

  it("rejects data that isn't a drawing", () => {
    expect(parseDrawing(null)).toBeNull();
    expect(parseDrawing({ id: "x" })).toBeNull();
    expect(parseDrawing({ ...drawing("a", 1), actions: "nope" })).toBeNull();
  });

  it("drops corrupt actions but keeps the rest", () => {
    const parsed = parseDrawing({
      ...drawing("a", 1),
      title: "",
      actions: [
        { type: "stroke", stroke: { ...drawing("a", 1).actions[1], brush: "laser" } },
        { type: "background", color: "not-a-color" },
        { type: "clear" },
        { type: "mystery" },
      ],
    });
    expect(parsed?.title).toBe("Untitled drawing");
    expect(parsed?.actions).toEqual([{ type: "clear" }]);
  });

  it("clamps out-of-range stroke settings", () => {
    const source = drawing("a", 1);
    const action = source.actions[1]!;
    if (action.type !== "stroke") throw new Error("fixture");
    const parsed = parseDrawing({
      ...source,
      actions: [{ type: "stroke", stroke: { ...action.stroke, size: 9999, opacity: -3 } }],
    });
    const first = parsed?.actions[0];
    expect(first?.type === "stroke" && [first.stroke.size, first.stroke.opacity]).toEqual([
      400, 0.05,
    ]);
  });
});

describe("older and odd saved data", () => {
  it("gives drawings saved before canvas shapes the original 1600 × 1200 size", () => {
    const { width: _w, height: _h, ...legacy } = drawing("a", 1);
    expect(parseDrawing(legacy)).toMatchObject({ width: 1600, height: 1200 });
  });

  it("clamps impossible canvas sizes and drops non-numeric brush options", () => {
    const parsed = parseDrawing({
      ...drawing("a", 1),
      width: 99999,
      actions: [
        { type: "canvas", width: 10, height: 1e9 },
        {
          type: "stroke",
          stroke: {
            id: "s",
            brush: "calligraphy",
            color: "#000000",
            size: 10,
            opacity: 1,
            symmetry: "none",
            seed: 1,
            points: [{ x: 0, y: 0, p: 1 }],
            options: { angle: 30, evil: "<script>" },
          },
        },
      ],
    });
    expect(parsed?.width).toBe(4000);
    expect(parsed?.actions[0]).toEqual({ type: "canvas", width: 200, height: 4000 });
    const stroke = parsed?.actions[1];
    expect(stroke?.type === "stroke" && stroke.stroke.options).toEqual({ angle: 30 });
  });
});

describe("compactStroke", () => {
  it("rounds points to two decimals", () => {
    const action = drawing("a", 1).actions[1]!;
    if (action.type !== "stroke") throw new Error("fixture");
    const compact = compactStroke({
      ...action.stroke,
      points: [{ x: 1.23456, y: 9.87654, p: 0.33333 }],
    });
    expect(compact.points).toEqual([{ x: 1.23, y: 9.88, p: 0.33 }]);
  });
});
