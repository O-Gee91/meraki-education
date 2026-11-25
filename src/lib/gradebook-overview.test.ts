import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP } from "@/lib/grading";
import { plannedAssignmentWeights, summarizeOverview, type OverviewStudent } from "@/lib/gradebook-overview";

const student = (id: string, average: number | null, missing = 0, excluded = false): OverviewStudent => ({ id, name: id, average, missing, excluded, note: null });

describe("gradebook overview", () => {
  it("uses the middle pair for the class median, not the mean", () => {
    const result = summarizeOverview([student("a", 40), student("b", 80), student("c", 90), student("d", 100)], DEFAULT_SETUP);
    expect(result.median).toBe(85);
    expect(result.mean).toBe(77.5);
  });
  it("excludes tester and dropped rows from class statistics but includes genuine zero grades", () => {
    const result = summarizeOverview([student("a", 0, 2), student("b", 80, 1), student("empty", null, 3), student("tester", 100, 50, true)], DEFAULT_SETUP);
    expect(result.students).toBe(3);
    expect(result.graded).toBe(2);
    expect(result.mean).toBe(40);
    expect(result.missing).toBe(6);
  });
  it("uses the class's own grade bands for distribution", () => {
    const result = summarizeOverview([student("a", 89), student("b", 90)], { ...DEFAULT_SETUP, scale: [{ letter: "Secure", min: 85 }, { letter: "Developing", min: 0 }] });
    expect(result.bands.find((b) => b.letter === "Secure")?.count).toBe(2);
    expect(result.bands.find((b) => b.letter === "Developing")?.count).toBe(0);
  });
  it("returns no statistics when no grades are recorded", () => {
    const result = summarizeOverview([student("a", null)], DEFAULT_SETUP);
    expect(result.median).toBeNull();
    expect(result.mean).toBeNull();
  });
  it("calculates planned points shares without counting bonus points in the denominator", () => {
    const weights = plannedAssignmentWeights([{ id: "a", category: "Homework", points_possible: 20 }, { id: "b", category: "Homework", points_possible: 80 }, { id: "bonus", category: "Extra credit", points_possible: 10 }], DEFAULT_SETUP);
    expect(weights.get("a")).toBe(20);
    expect(weights.get("b")).toBe(80);
    expect(weights.get("bonus")).toBeNull();
  });
  it("calculates category-weighted shares using the existing grading engine", () => {
    const weights = plannedAssignmentWeights([{ id: "a", category: "Homework", points_possible: 25 }, { id: "b", category: "Homework", points_possible: 75 }, { id: "c", category: "Test", points_possible: 100 }], { ...DEFAULT_SETUP, mode: "weighted", categories: [{ name: "Homework", weight: 40 }, { name: "Test", weight: 60 }] });
    expect(weights.get("a")).toBe(10);
    expect(weights.get("b")).toBe(30);
    expect(weights.get("c")).toBe(60);
  });
});