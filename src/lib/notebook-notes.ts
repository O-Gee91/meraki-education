import { gradeTone } from "@/lib/school";

/**
 * Decorative margin copy for an average that is already above the on-track
 * line `gradeTone` uses (80). The note does not replace or recompute the
 * percent the screen shows.
 */
export function aboveTrackNote(percent: number | null | undefined): string | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  if (gradeTone(percent) !== "text-success") return null;
  const gap = Math.round((percent - 80) * 10) / 10;
  if (gap <= 0) return null;
  return `+${gap.toFixed(1)}% above the on-track line`;
}

/** Steps a checklist can tick. `phase` is how many leading steps have finished. */
export function checklistSteps(labels: readonly string[], phase: number): { label: string; done: boolean }[] {
  const doneThrough = Number.isFinite(phase) ? Math.max(0, Math.floor(phase)) : 0;
  return labels.map((label, index) => ({ label, done: index < doneThrough }));
}
