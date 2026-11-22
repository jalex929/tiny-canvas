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
const doc = { width: DOC_WIDTH, height: DOC_HEIGHT };

describe("viewport", () => {
  it("fits and centers the drawing", () => {
    expect(fitScale(stage, doc)).toBe(0.5);
    expect(fitView(stage, doc)).toEqual({ s: 0.5, x: MARGIN, y: MARGIN });
    const v = fitView(phone, doc);
    expect(v.x).toBeCloseTo(MARGIN);
    expect(v.y + (DOC_HEIGHT * v.s) / 2).toBeCloseTo(phone.height / 2);
  });

  it("round-trips screen and document coordinates", () => {
    const v = { s: 1.7, x: -320, y: 45 };
    const p = docToScreen(v, 812, 433);
    expect(screenToDoc(v, p.x, p.y)).toEqual({ x: expect.closeTo(812), y: expect.closeTo(433) });
  });

  it("zooms around the pointer, keeping that spot still", () => {
    const v = fitView(stage, doc);
    const before = screenToDoc(v, 300, 200);
    const zoomed = zoomAt(v, 3, 300, 200, stage, doc);
    expect(zoomOf(zoomed, stage, doc)).toBeCloseTo(3);
    const after = screenToDoc(zoomed, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("limits zoom between fit and 8×", () => {
    const v = fitView(stage, doc);
    expect(zoomOf(zoomAt(v, 0.2, 100, 100, stage, doc), stage, doc)).toBe(1);
    expect(zoomOf(zoomAt(v, 100, 100, 100, stage, doc), stage, doc)).toBe(8);
  });

  it("never lets the paper be dragged off screen", () => {
    const zoomed = zoomAt(fitView(stage, doc), 4, 412, 312, stage, doc);
    const far = panBy(zoomed, 99999, -99999, stage, doc);
    expect(far.x).toBe(MARGIN);
    expect(far.y + DOC_HEIGHT * far.s).toBe(stage.height - MARGIN);
    // At fit, panning does nothing: the paper stays centered.
    expect(panBy(fitView(stage, doc), 50, 50, stage, doc)).toEqual(fitView(stage, doc));
  });

  it("keeps zoom level and center point when the stage resizes", () => {
    const zoomed = zoomAt(fitView(stage, doc), 2, 200, 150, stage, doc);
    const center = screenToDoc(zoomed, stage.width / 2, stage.height / 2);
    const resized = resizeView(zoomed, stage, { width: 1000, height: 700 }, doc);
    expect(zoomOf(resized, { width: 1000, height: 700 }, doc)).toBeCloseTo(2);
    const newCenter = screenToDoc(resized, 500, 350);
    expect(newCenter.x).toBeCloseTo(center.x);
    expect(newCenter.y).toBeCloseTo(center.y);
  });

  it("pans to follow the keyboard cursor", () => {
    const zoomed = clampView({ s: 2, x: 0, y: 0 }, stage, doc);
    const followed = ensureVisible(zoomed, DOC_WIDTH - 10, DOC_HEIGHT - 10, stage, doc);
    const p = docToScreen(followed, DOC_WIDTH - 10, DOC_HEIGHT - 10);
    expect(p.x).toBeLessThanOrEqual(stage.width);
    expect(p.y).toBeLessThanOrEqual(stage.height);
  });

  it("pinch zooms by finger spread and follows the midpoint", () => {
    const start = fitView(stage, doc);
    const startMid = { x: 400, y: 300 };
    const pinched = pinchView(start, startMid, 100, { x: 420, y: 310 }, 250, stage, doc);
    expect(zoomOf(pinched, stage, doc)).toBeCloseTo(2.5);
    const before = screenToDoc(start, 400, 300);
    const after = screenToDoc(pinched, 420, 310);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("fits a square drawing on a tall phone using the full width", () => {
    const square = { width: 1400, height: 1400 };
    const v = fitView(phone, square);
    expect(v.x).toBeCloseTo(MARGIN);
    expect(square.width * v.s).toBeCloseTo(phone.width - 2 * MARGIN);
  });
});
