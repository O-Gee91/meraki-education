export type GradebookQueryStatus = "pending" | "error" | "success" | "idle";

/**
 * Roster and assignment reads are part of the gradebook gate.
 * Pending and failed reads must not fall through to the empty-class prompt.
 */
export function gradebookReadGate(reads: {
  roster: GradebookQueryStatus;
  assignments: GradebookQueryStatus;
  grades: GradebookQueryStatus;
  submissions: GradebookQueryStatus;
}): "error" | "loading" | "ready" {
  const active = [reads.roster, reads.assignments, reads.grades, reads.submissions].filter(
    (status) => status !== "idle",
  );
  if (active.some((status) => status === "error")) return "error";
  if (active.some((status) => status === "pending")) return "loading";
  return "ready";
}

/** The empty-class prompt is only true once every required read has succeeded and a list is empty. */
export function showsEmptyGradebook(
  gate: "error" | "loading" | "ready",
  rosterCount: number,
  assignmentCount: number,
) {
  return gate === "ready" && (rosterCount === 0 || assignmentCount === 0);
}
