import { markCodeFromComment } from "@/lib/grading";
import { resolveWorkState } from "@/lib/coursework-state";

export type CourseworkKind = "assignment" | "assessment" | "discussion";

/** Calendar completion follows coursework, including explicit missing marks and cleared scores. */
export function calendarAssignmentComplete(
  submissionStatus: string | null | undefined,
  grade: { points_earned: number | null; comment: string | null } | undefined,
): boolean {
  const mark = markCodeFromComment(grade?.comment);
  if (mark === "M") return false;
  const result = resolveWorkState({
    score: grade?.points_earned ?? null,
    markLabel: mark,
    submissionStatus,
    missing: false,
    pastDue: false,
  });
  return ["graded", "marked", "collected", "turned_in"].includes(result.state);
}

export type CourseworkItem = {
  id: string;
  kind: CourseworkKind;
  title: string;
  classId: string;
  className: string;
  /** Calendar day (YYYY-MM-DD) in the class's time zone. */
  date: string;
  /** Local due time label, or null when only a date is set. */
  time: string | null;
  draft: boolean;
  completed: boolean;
};

/** Calendar day of an instant in a given IANA time zone. */
export function dayInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/**
 * Graded discussions and assessments each own a gradebook assignment. Drop
 * those linked assignments so one piece of work shows once on the calendar.
 */
export function dedupeLinkedAssignments<T extends { id: string; kind: CourseworkKind }>(
  items: T[],
  linkedAssignmentIds: Set<string>,
): T[] {
  return items.filter((i) => !(i.kind === "assignment" && linkedAssignmentIds.has(i.id)));
}

/**
 * Past items drop off the calendar automatically: anything dated before today
 * is hidden, and a timed event today is hidden once its end (or start) time passes.
 */
export function isUpcoming(
  item: { date: string; endTime?: string | null },
  todayKey: string,
  nowHHMM: string,
): boolean {
  if (item.date < todayKey) return false;
  if (item.date > todayKey || !item.endTime) return true;
  return item.endTime.slice(0, 5) > nowHHMM;
}
