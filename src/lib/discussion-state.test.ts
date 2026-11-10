import { describe, expect, it } from "vitest";
import { resolveDiscussionState } from "./discussion-state";

describe("resolveDiscussionState", () => {
  it("no posts is Missing", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 0, requiredReplies: 2 }).label).toBe("Missing");
  });
  it("replies without a main post is Partial", () => {
    expect(resolveDiscussionState({ rootCount: 0, replyCount: 3, requiredReplies: 2 }).state).toBe("replies_only");
  });
  it("main post with too few replies is Partial", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 1, requiredReplies: 2 }).label).toBe("Partial");
  });
  it("main post plus required replies is Complete", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 2, requiredReplies: 2 }).label).toBe("Complete");
  });
  it("main post with zero required replies is Complete", () => {
    expect(resolveDiscussionState({ rootCount: 1, replyCount: 0, requiredReplies: 0 }).state).toBe("complete");
  });
});
