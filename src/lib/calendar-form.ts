import type { Audience } from "@/lib/audience";

type CalendarAppearance = { category: string; color: string; audiences: Audience[] };

export const DEFAULT_COLOR_BY_CATEGORY: Record<string, string> = {
  event: "amber",
  exam: "red",
  deadline: "red",
  meeting: "navy",
  holiday: "navy",
};

export function withCalendarColor<T extends CalendarAppearance>(prev: T, color: string, base: T = prev): T {
  // Holiday colors never change an explicitly selected audience.
  if (base.category === "holiday") return { ...base, color };
  const wasStaff = prev.audiences.length === 1 && prev.audiences[0] === "teachers";
  if (color === "navy") return { ...base, color, audiences: ["teachers"] };
  if (wasStaff) return { ...base, color, audiences: ["everyone"] };
  return { ...base, color };
}

export function withCalendarCategory<T extends CalendarAppearance>(prev: T, category: string): T {
  const next = { ...prev, category, color: DEFAULT_COLOR_BY_CATEGORY[category] ?? prev.color };
  if (category === "meeting") return { ...next, audiences: ["teachers"] };
  // Selecting a holiday resets the meeting/staff default; staff-only can still be chosen explicitly.
  if (category === "holiday") return { ...next, audiences: ["everyone"] };
  return withCalendarColor(prev, next.color, next);
}

export function withCalendarAudience<T extends CalendarAppearance>(prev: T, value: Audience): T {
  if (value === "everyone") {
    return {
      ...prev,
      audiences: ["everyone"],
      color: prev.color === "navy" && prev.category !== "holiday" ? "amber" : prev.color,
    };
  }
  const without = prev.audiences.filter((a) => a !== "everyone");
  const next = without.includes(value) ? without.filter((a) => a !== value) : [...without, value];
  const audiences: Audience[] = next.length ? next : ["everyone"];
  const nowStaff = audiences.length === 1 && audiences[0] === "teachers";
  return { ...prev, audiences, color: nowStaff ? "navy" : prev.color };
}