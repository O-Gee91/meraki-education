import { describe, expect, it } from "vitest";
import { meetsDiscussionCriteria, resolveDiscussionState } from "./discussion-state";

describe("resolveDiscussionState", () => {
  it("no posts before the due date is Not started, not Missing", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 0, requiredReplies: 2 }).state).toBe("not_started");
  });
  it("no posts after the due date is Missing", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 0, requiredReplies: 2, pastDue: true }).label).toBe("Missing");
  });
  it("post plus required replies after due date is submitted, not missing", () => {
    const r = resolveDiscussionState({ rootCount: 1, replyCount: 2, requiredReplies: 2, pastDue: true });
    expect(r.state).toBe("complete");
    expect(r.label).toBe("Submitted · needs grading");
  });
  it("post with too few replies after due date shows missing replies", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 1, requiredReplies: 2, pastDue: true }).label).toBe("Missing replies · 1/2 replies");
  });
  it("replies without a main post after due date shows missing main post", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 3, requiredReplies: 2, pastDue: true }).label).toBe("Missing main post");
  });
  it("graded wins", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 0, requiredReplies: 2, graded: true }).state).toBe("graded");
  });
  it("zero required replies only needs a main post", () => {
    expect(meetsDiscussionCriteria(1, 0, 0)).toBe(true);
    expect(meetsDiscussionCriteria(0, 5, 0)).toBe(false);
  });
  it("complete work after the due date is submitted, not missing", () => {
    const r = resolveDiscussionState({ rootCount: 1, replyCount: 2, requiredReplies: 2, pastDue: true });
    expect(r.state).toBe("complete");
    expect(r.label).toBe("Submitted · needs grading");
  });
  it("incomplete work after the due date is missing", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 0, requiredReplies: 2, pastDue: true }).state).toBe("missing");
  });
  it("graded label keeps submission status separate", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 2, requiredReplies: 2, graded: true }).label).toBe("Submitted · graded");
  });
});
