/** Which class-pulse reads to start. The gradebook already owns grades and submissions. */

export type PulseRead = "submissions" | "student-links" | "attendance" | "behavior" | "wellbeing";

export type ReadState = "loading" | "error" | "ready";

export type TodaySignal = "attendance" | "missing" | "behavior" | "wellbeing";

export function pulseReadPlan(input: {
  staffView: boolean;
  /** Gradebook already computed missing work from its grade and submission reads. */
  parentSuppliesMissing: boolean;
  assignmentCount: number;
  rosterCount: number;
  checkInStudentId: string | null;
}): PulseRead[] {
  const reads: PulseRead[] = [];
  if (input.assignmentCount > 0 && !input.parentSuppliesMissing) reads.push("submissions");
  // Contacts are only needed when a teacher sends a check-in.
  if (input.staffView && input.rosterCount > 0 && input.checkInStudentId)
    reads.push("student-links");
  // Class-wide attendance, behavior, and wellbeing stay on the staff view.
  if (!input.staffView) return reads;
  reads.push("attendance");
  if (input.rosterCount > 0) reads.push("behavior");
  reads.push("wellbeing");
  return reads;
}

/** A disabled read is not loading. A failed read stays an error instead of an empty list. */
export function readState(
  included: boolean,
  query: { isError: boolean; isSuccess: boolean },
): ReadState {
  if (!included) return "ready";
  if (query.isError) return "error";
  if (query.isSuccess) return "ready";
  return "loading";
}

/** Never present a failed or unfinished read as zero. */
export function presentCount(state: ReadState, value: number | string): string {
  if (state === "loading") return "…";
  if (state === "error") return "Couldn't load";
  return String(value);
}

export function attentionFailureLabel(parts: string[]): string | null {
  const names = parts.map((part) => part.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const sentence = `${list} couldn't be loaded. Those counts stay blank until the read succeeds.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Teacher class page: one strip, and at most one detail.
 * Missing work opens its list. It does not also open the student grid.
 */
export function teacherTodayDetail(signal: TodaySignal | null, pulseOpen: boolean) {
  const missingList = signal === "missing";
  return {
    students: !missingList && (pulseOpen || signal != null),
    missingList,
    behaviorNotes: signal === "behavior",
  };
}
