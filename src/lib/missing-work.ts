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
  /** Whether the student turned it in (submitted/collected/returned — never a saved draft). */
  submitted?: boolean;
  today?: string;
  /** When the student joined this class; work due on or before that day is never auto-missing. */
  enrolledAt?: string | null;
  /** When the student left this class; later work is never auto-missing. */
  droppedAt?: string | null;
}

export function isMissingWork({ assignment, grade, submitted, today = todayKey(), enrolledAt, droppedAt }: MissingInput): boolean {
  const code = markCodeFromComment(grade?.comment);
  if (code === "M") return true;
  if (code) return false; // EX, INC, L… are teacher decisions, not missing
  const due = assignment.due_date?.slice(0, 10);
  const joined = enrolledAt?.slice(0, 10);
  if (due && joined && due <= joined) return false; // due before the student joined (e.g. transfer)
  const created = assignment.created_at?.slice(0, 10);
  if (created && joined && created < joined) return false; // created before the student joined
  const left = droppedAt?.slice(0, 10);
  if (due && left && due > left) return false; // due after the student left
  if (created && left && created > left) return false; // created after the student left

  if (assignment.status && assignment.status !== "published") return false;
  if (grade?.points_earned != null && grade.points_earned !== "") return false;
  if (submitted) return false;
  return shouldAutoFlag(assignment, today);
}
