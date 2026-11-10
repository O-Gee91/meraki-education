/**
 * Discussion participation state — one place that turns a student's posts
 * into a named state. Precedence: not_started → replies_only → root_only → complete.
 * Scoring is tracked separately (saved post scores), so "graded" is a flag.
 */
export type DiscussionState = "not_started" | "replies_only" | "root_only" | "complete";

export interface DiscussionStateInput {
  rootCount: number;
  replyCount: number;
  requiredReplies: number;
}

export const DISCUSSION_STATE_LABEL: Record<DiscussionState, string> = {
  not_started: "Missing",
  replies_only: "Partial",
  root_only: "Partial",
  complete: "Complete",
};

export function resolveDiscussionState(input: DiscussionStateInput): {
  state: DiscussionState;
  label: string;
} {
  const required = Math.max(0, input.requiredReplies);
  let state: DiscussionState;
  if (input.rootCount === 0) state = input.replyCount > 0 ? "replies_only" : "not_started";
  else state = input.replyCount >= required ? "complete" : "root_only";
  return { state, label: DISCUSSION_STATE_LABEL[state] };
}
