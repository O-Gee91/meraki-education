export const QUESTION_KINDS = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "short_answer",
  "numeric",
  "essay",
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  multiple_choice: "Multiple choice",
  multi_select: "Select all that apply",
  true_false: "True / false",
  short_answer: "Short answer",
  numeric: "Numeric",
  essay: "Essay / written response",
};

export const AUTO_GRADED: QuestionKind[] = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "short_answer",
  "numeric",
];

export const ASSESSMENT_KINDS = ["quiz", "test", "exit_ticket", "essay", "mixed"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  quiz: "Quiz",
  test: "Test / exam",
  exit_ticket: "Exit ticket",
  essay: "Essay",
  mixed: "Mixed assessment",
};

export type AnswerKey = {
  choice?: number | undefined;
  choices?: number[] | undefined;
  accepted?: string[] | undefined;
  value?: number | undefined;
  tolerance?: number | undefined;
  /** "Answers will vary" — leave ungraded until the teacher scores it. */
  manual?: boolean | undefined;
};

export type AnswerResponse = {
  choice?: number | undefined;
  choices?: number[] | undefined;
  text?: string | undefined;
  value?: number | undefined;
};

export type PaperQuestion = {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  /** Original index of each displayed option (present when shuffled). */
  optionIndices?: number[];
  points: number;
  rubric: string | null;
};

export type EssayIssue = {
  type: string;
  excerpt: string;
  suggestion: string;
  explanation: string;
};

/** Deterministic per-student shuffle; returns original indices in display order. */
export function seededOrder(length: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
