export type SharedKind = "assignment" | "assessment" | "grading";

export type SharedAssignmentPayload = {
  category: string;
  points_possible: number;
  due_date: string | null;
  description: string | null;
  submission_mode: string;
};

export type SharedAssessmentQuestion = {
  position: number;
  kind: string;
  prompt: string;
  options: string[];
  answer_key: Record<string, unknown>;
  points: number;
  rubric: string | null;
};

export type SharedAssessmentPayload = {
  kind: string;
  instructions: string | null;
  time_limit_minutes: number | null;
  grammar_check_enabled: boolean;
  questions: SharedAssessmentQuestion[];
};

export type SharedResource = {
  id: string;
  kind: SharedKind;
  grade_level: number | null;
  subject: string | null;
  title: string;
  description: string | null;
  payload: SharedAssignmentPayload | SharedAssessmentPayload;
  shared_by: string | null;
  shared_by_name: string;
  created_at: string;
};

export function questionCount(resource: SharedResource): number {
  const payload = resource.payload as SharedAssessmentPayload;
  return Array.isArray(payload?.questions) ? payload.questions.length : 0;
}
