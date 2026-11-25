import { computeAverage, isExtraCredit, letterFor, type GradingSetup } from "@/lib/grading";

export type OverviewStudent = {
  id: string;
  name: string;
  average: number | null;
  missing: number;
  excluded: boolean;
  note: string | null;
};

export function summarizeOverview(students: OverviewStudent[], setup: GradingSetup) {
  const counted = students.filter((s) => !s.excluded);
  const values = counted.flatMap((s) => s.average != null && Number.isFinite(s.average) ? [s.average] : []).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const lower = values[middle - 1];
  const upper = values[middle];
  const median = upper == null ? null : values.length % 2 === 0 && lower != null ? (lower + upper) / 2 : upper;
  const bands = [...setup.scale].sort((a, b) => a.min - b.min).map((band) => ({
    letter: band.letter,
    min: band.min,
    count: values.filter((value) => letterFor(value, setup.scale) === band.letter).length,
  }));
  return {
    median,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    graded: values.length,
    students: counted.length,
    missing: counted.reduce((sum, student) => sum + student.missing, 0),
    bands,
  };
}

/** Planned contribution with every regular assignment counted; actual shares vary by student. */
export function plannedAssignmentWeights(assignments: { id: string; category: string; points_possible: number }[], setup: GradingSetup) {
  const rows = assignments.map((a) => ({ category: a.category, pointsPossible: Number(a.points_possible), pointsEarned: 0, markCode: null }));
  return new Map(assignments.map((assignment, index) => [assignment.id,
    isExtraCredit(assignment.category) ? null : computeAverage(rows.map((row, i) => ({ ...row, pointsEarned: i === index ? row.pointsPossible : 0 })), setup),
  ]));
}