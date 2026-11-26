/**
 * Notebook selection.
 *
 * Notebook is a per-browser presentation preference, stored in localStorage
 * under STYLE_STORAGE_KEY and chosen from the same menu as the color scheme.
 * It is not a feature flag, a school setting, or a role.
 *
 * Selected means the stored value is exactly "notebook". Anything else,
 * including a missing value, is Standard ("normal"). The root document applies
 * `style-notebook` before first paint using that same check. When selected,
 * every surface in NOTEBOOK_SURFACES uses the notebook presentation: handwritten
 * headings, paper panels, ruled lists, and a non-color selected mark. The
 * preference does not change a query, a grade, or who can see a row.
 *
 * Class-wide attendance tallies count other students, so they stay on the staff
 * view. Students, guardians, and staff previewing as a student keep their own
 * history only. Row-level security still decides which rows come back.
 */
export type NotebookStyle = "normal" | "notebook";

export const STYLE_STORAGE_KEY = "meraki-style";

export const DEFAULT_STYLE: NotebookStyle = "normal";

/** Places that draw the notebook presentation when it is selected. */
export const NOTEBOOK_SURFACES = [
  "navigation",
  "page-title",
  "dashboard",
  "classes",
  "class",
  "assignments",
  "assessment",
  "wellbeing",
  "behavior",
  "messages",
  "community",
  "files",
  "students",
  "people",
  "moderation",
  "settings",
  "attendance",
] as const;

export type NotebookSurface = (typeof NOTEBOOK_SURFACES)[number];

export function resolveNotebookStyle(value: string | null | undefined): NotebookStyle {
  return value === "notebook" ? "notebook" : DEFAULT_STYLE;
}

export function notebookSelected(style: NotebookStyle): boolean {
  return style === "notebook";
}

/** Class name for documentElement. Empty when Standard, so the site stays unchanged. */
export function notebookDocumentClass(style: NotebookStyle): "style-notebook" | "" {
  return notebookSelected(style) ? "style-notebook" : "";
}

/**
 * Surfaces that draw notebook presentation for this choice.
 * The list does not depend on role. Page permissions stay where they are.
 */
export function surfacesForStyle(style: NotebookStyle): readonly NotebookSurface[] {
  return notebookSelected(style) ? NOTEBOOK_SURFACES : [];
}

/**
 * Class-wide attendance tallies name how many classmates share a status.
 * Students, guardians, and a staff preview of a student do not get that tally.
 */
export function classAttendanceNotebookVisible(style: NotebookStyle, staffView: boolean): boolean {
  return notebookSelected(style) && staffView;
}

/** Which attendance read the current view is allowed to request. */
export function attendanceReadKind(staffView: boolean): "class-day" | "own-history" {
  return staffView ? "class-day" : "own-history";
}
