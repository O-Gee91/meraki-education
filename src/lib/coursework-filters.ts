import type { WorkState } from "@/lib/coursework-state";

/**
 * Shared coursework list filters. Status comes from resolveWorkState, so a
 * filter never re-decides what counts as missing or turned in.
 */
export type CourseworkStatusFilter = "all" | "missing" | "submitted" | "needs_grading" | "graded";

export interface CourseworkFilter {
  status?: CourseworkStatusFilter;
  classId?: string | null;
  studentId?: string | null;
  /** Inclusive YYYY-MM-DD bounds on the due date. */
  dueFrom?: string | null;
  dueTo?: string | null;
}

export interface FilterableWork {
  state: WorkState;
  classId?: string | null;
  studentId?: string | null;
  dueDate?: string | null;
}

const STATUS_STATES: Record<Exclude<CourseworkStatusFilter, "all">, WorkState[]> = {
  missing: ["missing"],
  submitted: ["turned_in", "collected", "graded"],
  needs_grading: ["turned_in", "collected"],
  graded: ["graded"],
};

export function matchesCourseworkFilter(row: FilterableWork, f: CourseworkFilter): boolean {
  if (f.status && f.status !== "all" && !STATUS_STATES[f.status].includes(row.state)) return false;
  if (f.classId && row.classId !== f.classId) return false;
  if (f.studentId && row.studentId !== f.studentId) return false;
  if ((f.dueFrom || f.dueTo) && !row.dueDate) return false;
  if (f.dueFrom && row.dueDate && row.dueDate < f.dueFrom) return false;
  if (f.dueTo && row.dueDate && row.dueDate > f.dueTo) return false;
  return true;
}

export function applyCourseworkFilter<T extends FilterableWork>(rows: T[], f: CourseworkFilter): T[] {
  return rows.filter((r) => matchesCourseworkFilter(r, f));
}
