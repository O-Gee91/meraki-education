/**
 * Discussion participation state — the one place that turns a student's posts
 * into a named state. Scoring is tracked separately (saved post scores).
 *
 * Completion criteria (easy to adjust here):
 *   - at least MIN_MAIN_POSTS main (top-level) posts, and
 *   - at least `requiredReplies` replies.
 *
 * Precedence: graded → complete (needs grading) → partial → not started/missing.
 * "Missing" only appears once the due date has passed.
 */
export const MIN_MAIN_POSTS = 1;

export type DiscussionState =
  | "graded"
  | "complete"
  | "root_only"
  | "replies_only"
  | "not_started"
  | "missing";

export interface DiscussionStateInput {
  rootCount: number;
  replyCount: number;
  requiredReplies: number;
  /** Due date has passed. */
  pastDue?: boolean;
  /** Teacher has saved scores for this student. */
  graded?: boolean;
}

/** True when the student has met the post + reply criteria. */
export function meetsDiscussionCriteria(rootCount: number, replyCount: number, requiredReplies: number): boolean {
  return rootCount >= MIN_MAIN_POSTS && replyCount >= Math.max(0, requiredReplies);
}

export function resolveDiscussionState(input: DiscussionStateInput): {
  state: DiscussionState;
  label: string;
} {
  const required = Math.max(0, input.requiredReplies);
  const replies = `${Math.min(input.replyCount, required)}/${required} replies`;
  if (input.graded) return { state: "graded", label: "Graded" };
  if (meetsDiscussionCriteria(input.rootCount, input.replyCount, required))
    return { state: "complete", label: "Submitted · needs grading" };
  if (input.rootCount >= MIN_MAIN_POSTS)
    return { state: "root_only", label: input.pastDue ? `Missing replies · ${replies}` : `Partial · ${replies}` };
  if (input.replyCount > 0)
    return { state: "replies_only", label: input.pastDue ? "Missing main post" : "Replies only · main post needed" };
  return input.pastDue ? { state: "missing", label: "Missing" } : { state: "not_started", label: "Not started" };
}
