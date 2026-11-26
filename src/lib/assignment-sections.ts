/** Presentation only: reuse resolved hub status without changing work or grades. */
export function assignmentSections<T extends { status: string }>(rows: T[]) {
  return [
    { title: "Needs action", rows: rows.filter((row) => row.status !== "graded" && row.status !== "submitted") },
    { title: "Completed / Graded", rows: rows.filter((row) => row.status === "graded" || row.status === "submitted") },
  ].filter((section) => section.rows.length > 0);
}