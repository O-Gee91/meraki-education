import { describe, expect, it } from "vitest";
import { assignmentSections } from "./assignment-sections";

describe("daily assignment sections", () => {
  it("keeps missing, due and upcoming work in needs action", () => {
    const rows = [{ status: "missing" }, { status: "due" }, { status: "upcoming" }];
    expect(assignmentSections(rows)).toEqual([{ title: "Needs action", rows }]);
  });
  it("keeps turned-in work alongside graded work, without calling it graded", () => {
    const rows = [{ status: "graded" }, { status: "submitted" }];
    expect(assignmentSections(rows)).toEqual([{ title: "Completed / Graded", rows }]);
  });
  it("places action before completed work without losing or modifying rows", () => {
    const submitted = { id: "submitted", status: "submitted" };
    const missing = { id: "missing", status: "missing" };
    expect(assignmentSections([submitted, missing])).toEqual([
      { title: "Needs action", rows: [missing] },
      { title: "Completed / Graded", rows: [submitted] },
    ]);
  });
});