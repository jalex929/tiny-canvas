import { describe, expect, it } from "vitest";
import { DOC_HEIGHT, DOC_WIDTH } from "./types";
import {
  MARGIN,
  clampView,
  docToScreen,
  ensureVisible,
  fitScale,
  fitView,
  panBy,
  pinchView,
  resizeView,
  screenToDoc,
  zoomAt,
  zoomOf,
} from "./viewport";

const stage = { width: 824, height: 624 }; // fits 1600×1200 at exactly 0.5
const phone = { width: 400, height: 600 };

describe("viewport", () => {
  it("fits and centers the drawing", () => {
    expect(fitScale(stage)).toBe(0.5);
    expect(fitView(stage)).toEqual({ s: 0.5, x: MARGIN, y: MARGIN });
    const v = fitView(phone);
    expect(v.x).toBeCloseTo(MARGIN);
    expect(v.y + (DOC_HEIGHT * v.s) / 2).toBeCloseTo(phone.height / 2);
  });

  it("round-trips screen and document coordinates", () => {
    const v = { s: 1.7, x: -320, y: 45 };
    const p = docToScreen(v, 812, 433);
    expect(screenToDoc(v, p.x, p.y)).toEqual({ x: expect.closeTo(812), y: expect.closeTo(433) });
  });

  it("zooms around the pointer, keeping that spot still", () => {
    const v = fitView(stage);
    const before = screenToDoc(v, 300, 200);
    const zoomed = zoomAt(v, 3, 300, 200, stage);
    expect(zoomOf(zoomed, stage)).toBeCloseTo(3);
    const after = screenToDoc(zoomed, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("limits zoom between fit and 8×", () => {
    const v = fitView(stage);
    expect(zoomOf(zoomAt(v, 0.2, 100, 100, stage), stage)).toBe(1);
    expect(zoomOf(zoomAt(v, 100, 100, 100, stage), stage)).toBe(8);
  });

  it("never lets the paper be dragged off screen", () => {
    const zoomed = zoomAt(fitView(stage), 4, 412, 312, stage);
    const far = panBy(zoomed, 99999, -99999, stage);
    expect(far.x).toBe(MARGIN);
    expect(far.y + DOC_HEIGHT * far.s).toBe(stage.height - MARGIN);
    // At fit, panning does nothing: the paper stays centered.
    expect(panBy(fitView(stage), 50, 50, stage)).toEqual(fitView(stage));
  });

  it("keeps zoom level and center point when the stage resizes", () => {
    const zoomed = zoomAt(fitView(stage), 2, 200, 150, stage);
    const center = screenToDoc(zoomed, stage.width / 2, stage.height / 2);
    const resized = resizeView(zoomed, stage, { width: 1000, height: 700 });
    expect(zoomOf(resized, { width: 1000, height: 700 })).toBeCloseTo(2);
    const newCenter = screenToDoc(resized, 500, 350);
    expect(newCenter.x).toBeCloseTo(center.x);
    expect(newCenter.y).toBeCloseTo(center.y);
  });

  it("pans to follow the keyboard cursor", () => {
    const zoomed = clampView({ s: 2, x: 0, y: 0 }, stage);
    const followed = ensureVisible(zoomed, DOC_WIDTH - 10, DOC_HEIGHT - 10, stage);
    const p = docToScreen(followed, DOC_WIDTH - 10, DOC_HEIGHT - 10);
    expect(p.x).toBeLessThanOrEqual(stage.width);
    expect(p.y).toBeLessThanOrEqual(stage.height);
  });

  it("pinch zooms by finger spread and follows the midpoint", () => {
    const start = fitView(stage);
    const startMid = { x: 400, y: 300 };
    const pinched = pinchView(start, startMid, 100, { x: 420, y: 310 }, 250, stage);
    expect(zoomOf(pinched, stage)).toBeCloseTo(2.5);
    const before = screenToDoc(start, 400, 300);
    const after = screenToDoc(pinched, 420, 310);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
