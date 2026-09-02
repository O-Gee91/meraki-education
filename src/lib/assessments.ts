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
  points: number;
  rubric: string | null;
};

export type EssayIssue = {
  type: string;
  excerpt: string;
  suggestion: string;
  explanation: string;
};
