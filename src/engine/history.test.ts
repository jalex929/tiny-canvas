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
const ids = (actions: Action[]) => sceneFrom(actions).strokes.map((s) => s.id);

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
    expect(sceneFrom(h.past)).toEqual({ background: "#000052", strokes: [] });
    h = undo(undo(undo(h)));
    expect(sceneFrom(h.past).background).toBe("#ffffff");
  });
});
