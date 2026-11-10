/**
 * Coursework state machine — the single place that turns raw rows
 * (assignment, submission, grade, special mark) into one named state.
 *
 * Precedence (first match wins):
 *   mark → graded → collected → turned_in → missing → past_due → not_started
 *
 * Saved drafts never count as handed in. "missing" is decided by the caller's
 * shared missing rule (isMissingWork / shouldAutoFlag), passed in as `missing`.
 */
export type WorkState =
  | "marked"
  | "graded"
  | "collected"
  | "turned_in"
  | "missing"
  | "assigned"
  | "not_started";

export type WorkTone = "neutral" | "info" | "attention" | "success";

export const HANDED_IN_STATUSES = ["submitted", "collected", "returned"] as const;

export function isHandedIn(status: string | null | undefined): boolean {
  return status != null && (HANDED_IN_STATUSES as readonly string[]).includes(status);
}

export interface WorkStateInput {
  score: number | null;
  markLabel?: string | null | undefined;
  submissionStatus?: string | null | undefined;
  /** Handed in through another channel (e.g. an online assessment submission). */
  handedInElsewhere?: boolean | undefined;
  missing: boolean;
  pastDue: boolean;
}

export interface WorkStateResult {
  state: WorkState;
  label: string;
  tone: WorkTone;
}

export const WORK_STATE_META: Record<Exclude<WorkState, "marked">, { label: string; tone: WorkTone }> = {
  graded: { label: "Graded", tone: "success" },
  collected: { label: "Collected · not graded", tone: "info" },
  turned_in: { label: "Turned in · not graded", tone: "info" },
  missing: { label: "Missing", tone: "attention" },
  assigned: { label: "Assigned", tone: "neutral" },
  not_started: { label: "Not started", tone: "neutral" },
};

export function resolveWorkState(input: WorkStateInput): WorkStateResult {
  if (input.markLabel) return { state: "marked", label: input.markLabel, tone: "neutral" };
  const pick = (state: Exclude<WorkState, "marked">) => ({ state, ...WORK_STATE_META[state] });
  if (input.score != null) return pick("graded");
  if (input.submissionStatus === "collected") return pick("collected");
  if (isHandedIn(input.submissionStatus) || input.handedInElsewhere) return pick("turned_in");
  if (input.missing) return pick("missing");
  if (input.pastDue) return pick("assigned");
  return pick("not_started");
}
