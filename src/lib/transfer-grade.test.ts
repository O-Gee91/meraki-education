import { describe, expect, it } from "vitest";
import { computeAverage, DEFAULT_SCALE, DEFAULT_MARKS, DEFAULT_QUICK_SCORES } from "./grading";
import { transferPoints, TRANSFER_CATEGORY, TRANSFER_POINTS } from "./transfer-grade";

const weightedSetup = {
  mode: "weighted" as const,
  categories: [{ name: "Homework", weight: 20 }, { name: "Test", weight: 80 }],
  scale: DEFAULT_SCALE,
  marks: DEFAULT_MARKS,
  quickScores: DEFAULT_QUICK_SCORES,
};

describe("transfer grade", () => {
  it("carries the old percentage as points out of 100", () => {
    expect(TRANSFER_POINTS).toBe(100);
    expect(transferPoints(86.6666)).toBe(86.7);
  });
  it("skips students with no old grade", () => {
    expect(transferPoints(null)).toBeNull();
  });
  it("carries the old overall grade into a fully weighted class", () => {
    expect(computeAverage([
      { category: TRANSFER_CATEGORY, pointsPossible: 100, pointsEarned: 86.7, markCode: null },
    ], weightedSetup)).toBe(86.7);
  });
  it("counts the transfer alongside new weighted coursework", () => {
    expect(computeAverage([
      { category: TRANSFER_CATEGORY, pointsPossible: 100, pointsEarned: 86.7, markCode: null },
      { category: "Homework", pointsPossible: 100, pointsEarned: 100, markCode: null },
      { category: "Test", pointsPossible: 100, pointsEarned: 50, markCode: null },
    ], weightedSetup)).toBeCloseTo(58.67);
  });
});
