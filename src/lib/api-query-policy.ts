/** Short browser-only read reuse; explicit mutation invalidation still wins. */
export const READ_REUSE_MS = 30_000;
export const LIVE_REFRESH_MS = 60_000;

export function wellbeingFeedKey(userId: string | undefined, role: string, teacherMode: boolean, date = "") {
  return ["checkins", "wellbeing-feed", userId ?? null, role, teacherMode, date] as const;
}

export function feedbackKey(userId: string | undefined, role: string, preview: boolean, studentId?: string | null) {
  return ["my-feedback", userId ?? null, role, preview, studentId ?? null] as const;
}

export type DirectoryViewer = {
  userId?: string | null | undefined;
  role?: string | null | undefined;
  preview?: boolean | undefined;
};

/**
 * Students and classes lists are cached per viewer and per column list.
 * A narrower select must not reuse a row cached for a wider select.
 */
export function directoryQueryKey(
  table: "students" | "classes",
  columns: string,
  viewer: DirectoryViewer,
) {
  return [
    table,
    columns,
    viewer.userId ?? null,
    viewer.role ?? null,
    viewer.preview === true,
  ] as const;
}
