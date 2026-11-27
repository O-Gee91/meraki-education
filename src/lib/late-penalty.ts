/**
 * Progressive late penalty for work marked Missing ("M").
 * The single source for how much a Missing mark is worth; every average uses it.
 *
 * Rule: the due date itself is on time. Lateness starts after 11:59 pm on the
 * due date in the class's time zone. Each full day late removes the daily
 * amount from the assignment's full value; once days late reaches the
 * "zero after" limit the item is worth 0. Real scores are never adjusted.
 */
export type LatePenaltySettings = {
  late_penalty_enabled?: boolean | null;
  late_penalty_mode?: string | null;
  late_penalty_per_day?: number | string | null;
  late_penalty_zero_after_days?: number | null;
  due_date?: string | null;
  points_possible?: number | string | null;
};

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

/** Calendar date (YYYY-MM-DD) of `now` in the given time zone. */
function localDate(now: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Class calendar date (en-CA, YYYY-MM-DD) in `classes.timezone`.
 * Missing work, the grace day, and attendance's default day use this
 * instead of the UTC date.
 */
export function classCalendarDate(now: Date = new Date(), timezone?: string | null) {
  if (Number.isNaN(now.getTime())) return "";
  return localDate(now, timezone || DEFAULT_TIMEZONE);
}

/** Full days late after the due date ends (0 on or before the due date). */
export function daysLate(dueDate: string | null | undefined, now: Date, timezone = DEFAULT_TIMEZONE) {
  if (!dueDate) return 0;
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${localDate(now, timezone)}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

export function latePenaltyActive(a: LatePenaltySettings) {
  return Boolean(a.late_penalty_enabled) && Number(a.late_penalty_per_day ?? 0) > 0 && !!a.due_date;
}

export type MissingValue = { points: number; percent: number; daysLate: number; explanation: string };

/** What a Missing mark counts as today, or null when no penalty applies (M = 0). */
export function missingMarkValue(
  a: LatePenaltySettings,
  now: Date = new Date(),
  timezone = DEFAULT_TIMEZONE,
): MissingValue | null {
  if (!latePenaltyActive(a)) return null;
  const possible = Number(a.points_possible ?? 0);
  if (!(possible > 0)) return null;
  const days = daysLate(a.due_date, now, timezone);
  const perDay = Number(a.late_penalty_per_day ?? 0);
  const limit = a.late_penalty_zero_after_days ?? null;
  const pointsMode = a.late_penalty_mode === "points";
  const deduction = pointsMode ? perDay * days : (perDay / 100) * possible * days;
  const reachedLimit = limit != null && days >= limit;
  const points = reachedLimit ? 0 : Math.max(0, Math.round((possible - deduction) * 100) / 100);
  const percent = Math.round((points / possible) * 1000) / 10;
  const dayLabel = `${days} day${days === 1 ? "" : "s"} late`;
  let explanation: string;
  if (days === 0) explanation = "Not late yet · counts as full value";
  else if (points === 0) explanation = `${dayLabel} · counts as 0`;
  else {
    const amount = pointsMode ? `−${perDay * days} pts` : `−${Math.round(perDay * days * 10) / 10}%`;
    explanation = `${dayLabel} · ${amount} · counts as ${percent}%`;
  }
  return { points, percent, daysLate: days, explanation };
}

/** Points a Missing mark is worth for averages, or undefined for the normal 0. */
export function missingPointsFor(a: LatePenaltySettings, timezone?: string | null, now?: Date) {
  return missingMarkValue(a, now ?? new Date(), timezone || DEFAULT_TIMEZONE)?.points;
}
