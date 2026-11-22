import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, redo, sceneFrom, undo } from "./history";
import type { Action, Stroke } from "./types";

const stroke = (id: string, points = [{ x: 1, y: 2, p: 0.5 }]): Stroke => ({
  id,
  brush: "pen",
  color: "#000052",
  size: 10,
  opacity: 1,
  symmetry: "none",
  seed: 1,
  points,
});
const draw = (id: string): Action => ({ type: "stroke", stroke: stroke(id) });
const ids = (actions: Action[]) => sceneFrom(actions).strokes.map((s) => s.stroke.id);

describe("history", () => {
  it("starts empty with nothing to undo or redo", () => {
    const h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("undoes and redoes 25 sequential strokes in order", () => {
    let h = createHistory();
    for (let i = 0; i < 25; i++) h = commit(h, draw(`s${i}`));
    for (let i = 0; i < 25; i++) h = undo(h);
    expect(ids(h.past)).toEqual([]);
    expect(h.future).toHaveLength(25);
    for (let i = 0; i < 25; i++) h = redo(h);
    expect(ids(h.past)).toEqual(Array.from({ length: 25 }, (_, i) => `s${i}`));
    expect(canRedo(h)).toBe(false);
  });

  it("drops the redo branch when you draw after undoing", () => {
    let h = commit(commit(commit(createHistory(), draw("a")), draw("b")), draw("c"));
    h = undo(undo(h));
    expect(canRedo(h)).toBe(true);
    h = commit(h, draw("d"));
    expect(ids(h.past)).toEqual(["a", "d"]);
    expect(canRedo(h)).toBe(false);
  });

  it("does not mutate earlier history objects", () => {
    const before = commit(createHistory(), draw("a"));
    const snapshot = structuredClone(before);
    commit(before, draw("b"));
    undo(before);
    expect(before).toEqual(snapshot);
  });

  it("makes clear an undoable step", () => {
    let h = commit(commit(createHistory(), draw("a")), draw("b"));
    h = commit(h, { type: "clear" });
    expect(ids(h.past)).toEqual([]);
    h = undo(h);
    expect(ids(h.past)).toEqual(["a", "b"]);
  });

  it("ignores steps that would change nothing on screen", () => {
    const empty = createHistory();
    expect(commit(empty, { type: "clear" })).toBe(empty);
    expect(commit(empty, { type: "background", color: "#FFFFFF" })).toBe(empty);
    expect(commit(empty, { type: "stroke", stroke: stroke("x", []) })).toBe(empty);
  });

  it("tracks background changes and keeps them through a clear", () => {
    let h = commit(createHistory(), { type: "background", color: "#000052" });
    h = commit(h, draw("a"));
    h = commit(h, { type: "clear" });
    expect(sceneFrom(h.past)).toEqual({
      background: "#000052",
      width: 1600,
      height: 1200,
      strokes: [],
    });
    h = undo(undo(undo(h)));
    expect(sceneFrom(h.past).background).toBe("#ffffff");
  });

  it("starts at the size it was created with and keeps it through undo", () => {
    let h = createHistory([], { width: 1400, height: 1400 });
    h = commit(h, draw("a"));
    h = undo(h);
    expect(h.size).toEqual({ width: 1400, height: 1400 });
    expect(sceneFrom(h.past, h.size)).toMatchObject({ width: 1400, height: 1400 });
  });

  it("changing the canvas shape keeps earlier marks centered, and can be undone", () => {
    let h = commit(createHistory([], { width: 1600, height: 1200 }), draw("a"));
    h = commit(h, { type: "canvas", width: 1400, height: 1400 });
    h = commit(h, draw("b"));
    const scene = sceneFrom(h.past, h.size);
    expect(scene).toMatchObject({ width: 1400, height: 1400 });
    expect(scene.strokes[0]).toMatchObject({ dx: -100, dy: 100, width: 1600, height: 1200 });
    expect(scene.strokes[1]).toMatchObject({ dx: 0, dy: 0, width: 1400, height: 1400 });
    h = undo(undo(h));
    expect(sceneFrom(h.past, h.size)).toMatchObject({ width: 1600, height: 1200 });
    expect(sceneFrom(h.past, h.size).strokes[0]).toMatchObject({ dx: 0, dy: 0 });
  });

  it("ignores switching to the shape it already has", () => {
    const h = createHistory([], { width: 1400, height: 1400 });
    expect(commit(h, { type: "canvas", width: 1400, height: 1400 })).toBe(h);
  });
});
