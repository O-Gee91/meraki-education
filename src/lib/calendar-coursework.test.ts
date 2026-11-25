import { describe, expect, it } from "vitest";
import { calendarAssignmentComplete, dayInZone, dedupeLinkedAssignments } from "./calendar-coursework";

describe("calendar coursework", () => {
  it("an explicit Missing grade is not completed even when returned", () => {
    expect(calendarAssignmentComplete("returned", { points_earned: null, comment: "MARK:M" })).toBe(false);
  });
  it("a cleared score with feedback alone is not completed", () => {
    expect(calendarAssignmentComplete(null, { points_earned: null, comment: "Please revise" })).toBe(false);
  });
  it("a saved submission draft is not completed", () => {
    expect(calendarAssignmentComplete("draft", undefined)).toBe(false);
  });
  it("collected work awaiting grading is completed", () => {
    expect(calendarAssignmentComplete("collected", undefined)).toBe(true);
  });
  it("a posted zero grade counts as graded", () => {
    expect(calendarAssignmentComplete(null, { points_earned: 0, comment: null })).toBe(true);
  });
  it("puts a late-evening UTC due time on the next Shanghai day", () => {
    expect(dayInZone("2026-10-30T17:00:00Z", "Asia/Shanghai")).toBe("2026-10-31");
  });

  it("shows a graded discussion once, not also as its gradebook assignment", () => {
    const items = [
      { id: "a1", kind: "assignment" as const },
      { id: "d1", kind: "discussion" as const },
      { id: "a2", kind: "assignment" as const },
    ];
    expect(dedupeLinkedAssignments(items, new Set(["a1"])).map((i) => i.id)).toEqual(["d1", "a2"]);
  });
});
