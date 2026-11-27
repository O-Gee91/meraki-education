import { findMark, markCodeFromComment, type SpecialMark } from "@/lib/grading";
import { missingPointsFor, type LatePenaltySettings } from "@/lib/late-penalty";

type ScoredGrade = {
  assignment_id?: string;
  student_id?: string;
  points_earned: number | string | null;
  comment?: string | null;
  is_draft?: boolean | null;
};

/**
 * Percent one posted grade contributes. Missing (M) uses missingPointsFor
 * in the class zone. Drafts, blanks, and excused marks are left out.
 */
export function scoredPercent(
  assignment: LatePenaltySettings & { points_possible: number | string },
  grade: ScoredGrade,
  marks: SpecialMark[],
  timeZone?: string | null,
  now?: Date,
): number | null {
  if (grade.is_draft) return null;
  const possible = Number(assignment.points_possible) || 0;
  if (!(possible > 0)) return null;
  const mark = findMark(markCodeFromComment(grade.comment), marks);
  if (mark) {
    if (mark.behavior === "exclude") return null;
    if (mark.behavior === "zero") {
      const points = mark.code.toUpperCase() === "M" ? (missingPointsFor(assignment, timeZone, now) ?? 0) : 0;
      return (points / possible) * 100;
    }
    return Number(mark.value ?? 0);
  }
  if (grade.points_earned == null || grade.points_earned === "") return null;
  return (Number(grade.points_earned) / possible) * 100;
}

export function meanPercent(values: Array<number | null | undefined>): number | null {
  const kept = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!kept.length) return null;
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/** Column mean over active, non-test students. Drafts and dropped rows are skipped. */
export function columnPercents(
  assignment: LatePenaltySettings & { id?: string; points_possible: number | string },
  grades: ScoredGrade[],
  countedStudentIds: ReadonlySet<string>,
  marks: SpecialMark[],
  timeZone?: string | null,
  now?: Date,
): number[] {
  return grades.flatMap((grade) => {
    if (assignment.id && grade.assignment_id !== assignment.id) return [];
    if (!grade.student_id || !countedStudentIds.has(grade.student_id)) return [];
    const percent = scoredPercent(assignment, grade, marks, timeZone, now);
    return percent == null ? [] : [percent];
  });
}
