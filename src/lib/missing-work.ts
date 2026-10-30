import { markCodeFromComment } from "@/lib/grading";
import { shouldAutoFlag, todayKey } from "@/lib/assignment-status";

/**
 * The single "missing work" rule shared by Gradebook, class snapshot, Pulse,
 * the student Assignments hub and Overview.
 *
 * Missing when a teacher marked it "M", or when it is published, past due
 * (after the grace period, never for backdated work), not turned in and has
 * no posted score or special mark. Excused (EX) is never missing.
 */
export interface MissingInput {
  assignment: {
    due_date?: string | null | undefined;
    created_at?: string | null | undefined;
    status?: string | null | undefined;
  };
  /** Posted (non-draft) grade for this student, if any. */
  grade?: { points_earned?: number | string | null; comment?: string | null } | null | undefined;
  /** Whether the student has any submission row for this assignment. */
  submitted?: boolean;
  today?: string;
}

export function isMissingWork({ assignment, grade, submitted, today = todayKey() }: MissingInput): boolean {
  const code = markCodeFromComment(grade?.comment);
  if (code === "M") return true;
  if (code) return false; // EX, INC, L… are teacher decisions, not missing
  if (assignment.status && assignment.status !== "published") return false;
  if (grade?.points_earned != null && grade.points_earned !== "") return false;
  if (submitted) return false;
  return shouldAutoFlag(assignment, today);
}
