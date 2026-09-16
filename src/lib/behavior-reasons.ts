/** Shared reason vocabulary for the behavior log (form, log rows, tracker). */

export const STRIKE_REASONS = [
  { value: "plagiarism", label: "Plagiarism" },
  { value: "cheating", label: "Cheating / Academic Dishonesty" },
  { value: "disruptive", label: "Disruptive Behavior" },
  { value: "disrespect", label: "Disrespect (toward peers or staff)" },
  { value: "language", label: "Inappropriate Language" },
  { value: "instructions", label: "Not Following Instructions" },
  { value: "off_task", label: "Off-Task / Not Working" },
  { value: "aggression", label: "Physical Aggression / Contact" },
  { value: "other", label: "Other" },
] as const;

export const CONCERN_REASONS = [
  { value: "academic", label: "Academic" },
  { value: "behavioral", label: "Behavioral" },
  { value: "social_emotional", label: "Social / Emotional" },
  { value: "other", label: "Other" },
] as const;

/** Types offered when logging a new note. "incident" stays readable for old rows. */
export const NOTE_KINDS = ["positive", "concern", "strike"] as const;

export function reasonsFor(kind: string) {
  if (kind === "strike") return STRIKE_REASONS as readonly { value: string; label: string }[];
  if (kind === "concern") return CONCERN_REASONS as readonly { value: string; label: string }[];
  return [] as readonly { value: string; label: string }[];
}

export function reasonLabel(kind: string, reason: string | null | undefined) {
  if (!reason) return null;
  const match = reasonsFor(kind).find((entry) => entry.value === reason);
  return match?.label ?? reason;
}

export function kindLabel(kind: string) {
  if (kind === "strike") return "Strike";
  if (kind === "concern") return "Concern";
  if (kind === "positive") return "Positive";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
