/**
 * Timeline buckets for the class Coursework tab.
 * Current: due within the past 7 days through the next 7 days, undated work,
 * or older work still waiting on grading. Upcoming: due more than 7 days out.
 * Past: due more than 7 days ago with nothing left to grade.
 */
export type CourseworkBucket = "current" | "upcoming" | "past";

export const DUE_SOON_DAYS = 7;
export const CURRENT_LOOKBACK_DAYS = 7;
export const CURRENT_LOOKAHEAD_DAYS = DUE_SOON_DAYS;

function shift(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function courseworkBucket(
  dueDate: string | null | undefined,
  today: string,
  needsGrading = false,
): CourseworkBucket {
  const due = dueDate?.slice(0, 10);
  if (!due) return "current";
  if (due > shift(today, CURRENT_LOOKAHEAD_DAYS)) return "upcoming";
  if (due < shift(today, -CURRENT_LOOKBACK_DAYS)) return needsGrading ? "current" : "past";
  return "current";
}

/** Due today through the next 7 days. */
export function isDueSoon(dueDate: string | null | undefined, today: string): boolean {
  const due = dueDate?.slice(0, 10);
  if (!due) return false;
  return due >= today && due <= shift(today, DUE_SOON_DAYS);
}
