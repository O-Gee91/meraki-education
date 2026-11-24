/**
 * Timeline buckets for the class Coursework tab.
 * Current: due within the past 7 days or the next 7 days,
 * Upcoming: due more than 7 days ahead.
 * Current also holds undated work,
 * or older work still waiting on grading.
 * Past: due more than 7 days ago with nothing left to grade.
 */
export type CourseworkBucket = "current" | "upcoming" | "past";

export const DUE_SOON_DAYS = 7;
export const CURRENT_LOOKBACK_DAYS = 7;

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
  if (due < shift(today, -CURRENT_LOOKBACK_DAYS)) return needsGrading ? "current" : "past";
  if (due > shift(today, DUE_SOON_DAYS)) return "upcoming";
  return "current";
}

/** Due today through the next 7 days. */
export function isDueSoon(dueDate: string | null | undefined, today: string): boolean {
  const due = dueDate?.slice(0, 10);
  if (!due) return false;
  return due >= today && due <= shift(today, DUE_SOON_DAYS);
}
