/** Presentation totals only; ungraded counts come from the existing gradebook helpers. */
export function gradingAttentionSummary(
  ungradedCounts: Record<string, number>,
  grades: Array<{ student_id: string; is_draft?: boolean | null }>,
  activeStudentIds: Set<string>,
) {
  return {
    ungraded: Object.values(ungradedCounts).reduce((sum, count) => sum + count, 0),
    drafts: grades.filter((grade) => activeStudentIds.has(grade.student_id) && grade.is_draft).length,
  };
}