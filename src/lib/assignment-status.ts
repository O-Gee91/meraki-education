// Assignment status rules.
//
// Creation date and due date are independent. A teacher can backdate an
// assignment (create it after its due date has already passed) for record
// keeping — in that case students must never be auto-flagged Late or Missing.
// The row stays neutral ("Assigned") until the teacher records something:
// a score, a special mark, a collection, or an explicit Missing mark.
//
// Auto-flagging only applies when the assignment existed before its due date
// and the student's status is still unresolved after a short grace period.

export const AUTO_FLAG_GRACE_DAYS = 1;

const dayKey = (value?: string | null) => (value ? value.slice(0, 10) : null);

export const todayKey = () => new Date().toISOString().slice(0, 10);

/** Created after its own due date — a backdated / retroactive assignment. */
export function isBackdatedAssignment(
  createdAt?: string | null,
  dueDate?: string | null,
): boolean {
  const created = dayKey(createdAt);
  const due = dayKey(dueDate);
  if (!created || !due) return false;
  return created > due;
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * True when it is fair to auto-flag unresolved work as Late/Missing:
 * there is a due date, the assignment was created on or before it, and the
 * grace period after the due date has elapsed.
 */
export function shouldAutoFlag(
  assignment: { created_at?: string | null | undefined; due_date?: string | null | undefined },
  today: string = todayKey(),
  graceDays: number = AUTO_FLAG_GRACE_DAYS,
): boolean {
  const due = dayKey(assignment.due_date);
  if (!due) return false;
  if (isBackdatedAssignment(assignment.created_at, due)) return false;
  return today > addDays(due, graceDays);
}
