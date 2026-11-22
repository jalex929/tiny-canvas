import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom has no layout or canvas. Components handle a missing 2D context already.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
