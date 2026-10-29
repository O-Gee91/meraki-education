// Decides which check-ins count as "new" for the educator Wellbeing nav badge.
// A check-in is new when it arrived after the teacher last opened Wellbeing,
// within the last 7 days, and no staff member has responded yet.
export const BADGE_WINDOW_DAYS = 7;

export function countNewCheckins(
  items: { createdAt: string; responses: unknown[] }[],
  lastSeen: string | null,
  now: Date = new Date(),
): number {
  const windowStart = now.getTime() - BADGE_WINDOW_DAYS * 86_400_000;
  const seen = lastSeen ? Date.parse(lastSeen) : 0;
  const since = Math.max(windowStart, Number.isNaN(seen) ? 0 : seen);
  return items.filter((c) => Date.parse(c.createdAt) > since && c.responses.length === 0).length;
}

export const wellbeingSeenKey = (userId: string) => `meraki-wellbeing-seen-${userId}`;
