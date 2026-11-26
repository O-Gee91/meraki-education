import { describe, expect, it } from "vitest";
import { seededRandom, sketchBox, sketchCircle, sketchGrid, sketchLine, sketchTick } from "./sketch";
import { DEFAULT_STYLE, resolveNotebookStyle } from "./notebook-style";
describe("notebook appearance", () => {
  it("is off by default and rejects unknown stored styles", () => {
    expect(DEFAULT_STYLE).toBe("normal");
    expect(resolveNotebookStyle(null)).toBe("normal");
    expect(resolveNotebookStyle("other")).toBe("normal");
    expect(resolveNotebookStyle("notebook")).toBe("notebook");
  });
  it("keeps marks stable across refreshes and distinct across owners", () => {
    expect(sketchCircle(50, 25, 46, 21, seededRandom("today:2026-11-26"))).toBe(sketchCircle(50, 25, 46, 21, seededRandom("today:2026-11-26")));
    expect(sketchLine(0, 0, 100, 0, seededRandom("a"))).not.toBe(sketchLine(0, 0, 100, 0, seededRandom("b")));
  });
  it("produces complete finite geometry", () => {
    expect(sketchBox(0, 0, 100, 50, seededRandom("box"))).toHaveLength(4);
    expect(sketchGrid(7, 5, seededRandom("grid"))).toHaveLength(14);
    expect(sketchTick(0, 0, 10, seededRandom("tick"))).toHaveLength(2);
    expect(sketchLine(0, 0, 0, 0, seededRandom("zero"))).not.toMatch(/NaN|Infinity/);
  });
});