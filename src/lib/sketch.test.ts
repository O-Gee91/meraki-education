import { describe, expect, it } from "vitest";
import { seededRandom, sketchArrow, sketchBox, sketchCircle, sketchDoodle, sketchGrid, sketchLine, sketchPlane, sketchStar, sketchTick, sketchTally, sketchMood } from "./sketch";
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
  it("draws tally groups of five without inventing unrecorded attendance", () => {
    expect(sketchTally(0, seededRandom("a"))).toEqual([]);
    expect(sketchTally(5, seededRandom("a"))).toHaveLength(5);
    expect(sketchTally(12, seededRandom("a"))).toHaveLength(12);
    expect(sketchTally(Number.NaN, seededRandom("a"))).toEqual([]);
  });
  it("keeps arrows, doodles and planes stable and finite", () => {
    const rand = seededRandom("mark");
    expect(sketchArrow(4, 20, 90, 18, rand)).toHaveLength(3);
    expect(sketchArrow(4, 20, 90, 18, seededRandom("mark"))).toEqual(sketchArrow(4, 20, 90, 18, seededRandom("mark")));
    expect(sketchArrow(4, 20, 90, 18, seededRandom("mark"))).not.toEqual(sketchArrow(4, 20, 90, 18, seededRandom("other")));
    expect(sketchDoodle(seededRandom("doodle")).join(" ")).toBe(sketchDoodle(seededRandom("doodle")).join(" "));
    expect(sketchDoodle(seededRandom("doodle")).join(" ")).not.toBe(sketchDoodle(seededRandom("other")).join(" "));
    expect(sketchStar(20, 20, 12, seededRandom("star"))).not.toMatch(/NaN|Infinity/);
    expect(sketchPlane(seededRandom("plane"))).toHaveLength(2);
    expect(sketchPlane(seededRandom("plane")).join("")).not.toMatch(/NaN|Infinity/);
    expect(sketchArrow(0, 0, 0, 0, seededRandom("zero")).join("")).not.toMatch(/NaN|Infinity/);
  });
  it("keeps mood marks stable and distinguishes neutral from low and positive moods", () => {
    expect(sketchMood(3, seededRandom("m"))).toEqual(sketchMood(3, seededRandom("m")));
    expect(sketchMood(3, seededRandom("m"))).not.toEqual(sketchMood(1, seededRandom("m")));
    expect(sketchMood(5, seededRandom("m"))).not.toEqual(sketchMood(1, seededRandom("m")));
  });
});