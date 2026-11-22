import { describe, expect, it } from "vitest";
import { pullBrush } from "./stabilizer";

describe("line smoothing", () => {
  it("off follows the pointer exactly", () => {
    expect(pullBrush({ x: 0, y: 0 }, { x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it("ignores jitter inside the string length", () => {
    expect(pullBrush({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toBeNull();
  });

  it("trails the pointer by exactly the string length", () => {
    const p = pullBrush({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)!;
    expect(Math.hypot(30 - p.x, 40 - p.y)).toBeCloseTo(10);
    expect(p.x / p.y).toBeCloseTo(30 / 40); // straight toward the pointer
  });

  it("turns a zigzag into a much calmer line", () => {
    let brush = { x: 0, y: 0 };
    const ys: number[] = [];
    for (let i = 1; i <= 60; i++) {
      const pointer = { x: i * 4, y: i % 2 ? 3 : -3 }; // 6px jitter
      brush = pullBrush(brush, pointer, 8) ?? brush;
      ys.push(brush.y);
    }
    expect(Math.max(...ys.slice(10)) - Math.min(...ys.slice(10))).toBeLessThan(2);
  });
});
