export type StudentSortMode = "last-asc" | "last-desc" | "first-asc" | "first-desc";

export type SortableStudent = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export const DEFAULT_STUDENT_SORT: StudentSortMode = "last-asc";

export const STUDENT_SORT_LABELS: Record<StudentSortMode, string> = {
  "last-asc": "Last name, A–Z",
  "last-desc": "Last name, Z–A",
  "first-asc": "First name, A–Z",
  "first-desc": "First name, Z–A",
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: false,
});

const clean = (value: string | null | undefined) => (value ?? "").trim();

function compareField(a: string, b: string, direction: 1 | -1) {
  if (!a && b) return 1;
  if (a && !b) return -1;
  return collator.compare(a, b) * direction;
}

export function compareStudentNames(
  a: SortableStudent | null | undefined,
  b: SortableStudent | null | undefined,
  mode: StudentSortMode = DEFAULT_STUDENT_SORT,
) {
  const primary = mode.startsWith("last") ? "last_name" : "first_name";
  const secondary = primary === "last_name" ? "first_name" : "last_name";
  const direction: 1 | -1 = mode.endsWith("desc") ? -1 : 1;
  const primaryResult = compareField(clean(a?.[primary]), clean(b?.[primary]), direction);
  if (primaryResult !== 0) return primaryResult;
  const secondaryResult = compareField(clean(a?.[secondary]), clean(b?.[secondary]), direction);
  if (secondaryResult !== 0) return secondaryResult;
  return collator.compare(clean(a?.id), clean(b?.id));
}

/** Dummy/demo accounts: flagged in the database, with a name fallback. */
export function isTestStudent(student: (SortableStudent & { is_tester?: boolean | null }) | null | undefined) {
  if (!student) return false;
  if (student.is_tester) return true;
  return clean(student.first_name).toLowerCase() === "student" && clean(student.last_name).toLowerCase() === "tester";
}

/** Remove demo accounts from staff grading counts, rosters and bulk actions. */
export function withoutTestStudents<T>(
  items: readonly T[],
  getStudent: (item: T) => (SortableStudent & { is_tester?: boolean | null }) | null | undefined = (item) =>
    item as SortableStudent & { is_tester?: boolean | null },
) {
  return items.filter((item) => !isTestStudent(getStudent(item)));
}

export function sortStudents<T>(
  items: readonly T[],
  mode: StudentSortMode = DEFAULT_STUDENT_SORT,
  getStudent: (item: T) => SortableStudent | null | undefined = (item) =>
    item as SortableStudent,
) {
  return [...items].sort((a, b) => {
    const sa = getStudent(a);
    const sb = getStudent(b);
    const ta = isTestStudent(sa);
    const tb = isTestStudent(sb);
    if (ta !== tb) return ta ? 1 : -1;
    return compareStudentNames(sa, sb, mode);
  });
}

export function isStudentSortMode(value: string | null): value is StudentSortMode {
  return value != null && value in STUDENT_SORT_LABELS;
}