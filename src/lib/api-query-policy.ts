/** Short browser-only read reuse; explicit mutation invalidation still wins. */
export const READ_REUSE_MS = 30_000;
export const LIVE_REFRESH_MS = 60_000;

export function wellbeingFeedKey(userId: string | undefined, role: string, teacherMode: boolean, date = "") {
  return ["checkins", "wellbeing-feed", userId ?? null, role, teacherMode, date] as const;
}

export function feedbackKey(userId: string | undefined, role: string, preview: boolean, studentId?: string | null) {
  return ["my-feedback", userId ?? null, role, preview, studentId ?? null] as const;
}