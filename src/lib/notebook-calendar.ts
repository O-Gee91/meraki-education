/**
 * Presentation helpers for the notebook calendar.
 * They regroup rows the month query already returned. They do not fetch,
 * filter by role, or change a grade.
 */

export type CalendarMarkKind = "event" | "assignment" | "reminder";

export function calendarMarkKind(input: { source: "event"; category: string } | { source: "work"; kind: string }): CalendarMarkKind {
  if (input.source === "work") return "assignment";
  if (input.category === "deadline") return "reminder";
  if (input.category === "exam") return "assignment";
  return "event";
}

export function addDays(key: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Kind-colored swipes cover today and the next 7 days. Past days are crossed out instead. */
export function inSwipeWindow(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return date >= today && date <= addDays(today, 7);
}

export function monthContainsDay(today: string, monthStart: string, monthEnd: string): boolean {
  return today >= monthStart && today <= monthEnd;
}

export type AgendaBuckets<T> = { earlier: T[]; ahead: T[] };

export function partitionAgenda<T extends { date: string }>(items: T[], today: string): AgendaBuckets<T> {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  return {
    earlier: sorted.filter((item) => item.date < today),
    ahead: sorted.filter((item) => item.date >= today),
  };
}

export function agendaDates<T extends { date: string }>(items: T[]): string[] {
  return [...new Set(items.map((item) => item.date))];
}
