import { describe, expect, it } from "vitest";
import { dayInZone, dedupeLinkedAssignments } from "./calendar-coursework";

describe("calendar coursework", () => {
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
