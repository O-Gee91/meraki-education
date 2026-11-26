import { describe, expect, it } from "vitest";
import { gradingAttentionSummary } from "./class-attention";

describe("teacher grading attention", () => {
  it("keeps submitted ungraded work and draft grades as separate counts", () => {
    expect(gradingAttentionSummary({ essay: 2, discussion: 3 }, [
      { student_id: "active", is_draft: true },
      { student_id: "active", is_draft: false },
      { student_id: "tester", is_draft: true },
      { student_id: "dropped", is_draft: true },
    ], new Set(["active"]))).toEqual({ ungraded: 5, drafts: 1 });
  });
});