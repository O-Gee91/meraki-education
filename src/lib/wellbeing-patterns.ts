// Shared, non-clinical wellbeing pattern rules used by the teacher summary.

export type MoodEntry = { studentId: string; mood: number; date: string; note?: string | null };

export const LOW_MOOD = 2;

/** Why a student may appreciate a quiet check-in, or null when nothing stands out. */
export function followUpReason(entries: MoodEntry[], today: string): string | null {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length >= 2 && sorted[0].mood <= LOW_MOOD && sorted[1].mood <= LOW_MOOD) {
    return "Two low check-ins in a row";
  }
  const since = shiftDate(today, -6);
  const lowThisWeek = sorted.filter((e) => e.date >= since && e.mood <= LOW_MOOD).length;
  if (lowThisWeek >= 3) return "Several low check-ins this week";
  return null;
}

/** Gentle wording for a group's average mood; never a score or ranking. */
export function moodTrendLabel(average: number | null): string {
  if (average == null) return "No check-ins yet";
  if (average >= 3.8) return "Mostly positive";
  if (average >= 2.8) return "Steady";
  return "Some support may help";
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
