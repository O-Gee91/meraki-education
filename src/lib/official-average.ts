import { computeAverage, markCodeFromComment, type GradingSetup } from "@/lib/grading";
import { missingPointsFor, type LatePenaltySettings } from "@/lib/late-penalty";
import { isMissingWork } from "@/lib/missing-work";

export type OfficialAssignment = LatePenaltySettings & {
  id: string;
  category: string;
  points_possible: number | string;
  due_date?: string | null;
  created_at?: string | null;
  status?: string | null;
};

export type OfficialGrade = {
  assignment_id: string;
  student_id: string;
  points_earned: number | string | null;
  comment?: string | null;
  is_draft?: boolean | null;
};

/** Draft rows stay on the grade cell. Official percentages count posted rows only. */
export function isPostedGrade(grade: { is_draft?: boolean | null } | null | undefined) {
  return !!grade && grade.is_draft !== true;
}

export function postedGradeFields(postedBy: string | null, now = new Date().toISOString()) {
  return {
    is_draft: false as const,
    posted_at: now,
    posted_by: postedBy,
    updated_at: now,
  };
}

/** Class percentage from posted grades, with Missing marks valued by the class zone. */
export function officialAverage(
  assignments: OfficialAssignment[],
  grades: OfficialGrade[],
  studentId: string,
  setup: GradingSetup,
  timeZone?: string | null,
  now?: Date,
): number | null {
  return computeAverage(
    assignments.map((assignment) => {
      const grade = grades.find(
        (entry) =>
          entry.student_id === studentId &&
          entry.assignment_id === assignment.id &&
          isPostedGrade(entry),
      );
      return {
        category: assignment.category,
        pointsPossible: Number(assignment.points_possible),
        pointsEarned:
          grade?.points_earned == null || grade.points_earned === "" ? null : Number(grade.points_earned),
        markCode: markCodeFromComment(grade?.comment),
        missingPoints: missingPointsFor(assignment, timeZone, now),
      };
    }),
    setup,
  );
}

/**
 * Printed percentage and missing count share one assignment list.
 * A filtered column set must not count missing work the percentage ignores.
 */
export function printStanding(input: {
  assignments: OfficialAssignment[];
  grades: OfficialGrade[];
  studentId: string;
  setup: GradingSetup;
  timeZone?: string | null;
  today: string;
  submitted: (assignmentId: string) => boolean;
  enrolledAt?: string | null;
  droppedAt?: string | null;
  now?: Date;
}) {
  const percent = officialAverage(
    input.assignments,
    input.grades,
    input.studentId,
    input.setup,
    input.timeZone,
    input.now,
  );
  const missing = input.assignments.filter((assignment) => {
    const grade = input.grades.find(
      (entry) =>
        entry.student_id === input.studentId &&
        entry.assignment_id === assignment.id &&
        isPostedGrade(entry),
    );
    return isMissingWork({
      assignment,
      grade,
      submitted: input.submitted(assignment.id),
      today: input.today,
      enrolledAt: input.enrolledAt ?? null,
      droppedAt: input.droppedAt ?? null,
    });
  }).length;
  return { percent, missing };
}
