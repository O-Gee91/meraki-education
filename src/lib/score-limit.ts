import { findMark, isTransferGrade, type SpecialMark } from "@/lib/grading";

/**
 * Highest numeric score accepted on a Transfer column.
 * Transfer stores the previous class percentage, which extra credit can lift
 * above the column's 100 points. The old entry form already refused anything
 * above 10000, and that sanity cap stays.
 */
export const TRANSFER_SCORE_CAP = 10000;

export type ScoreLimitKind =
  | "assignment"
  | "question"
  | "response"
  | "reply"
  | "discussion"
  | "assessment";

const LIMIT_NOUN: Record<ScoreLimitKind, string> = {
  assignment: "the total for this assignment",
  question: "the total for this question",
  response: "the total for this response",
  reply: "the total for this reply",
  discussion: "the total for this discussion",
  assessment: "the total for this assessment",
};

/** Display a score without trailing zeros, matching what teachers type. */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

/** Sentence shared by the gradebook, discussions, assessments, and the database trigger. */
export function overTotalScoreMessage(maximum: number, kind: ScoreLimitKind = "assignment"): string {
  return `Score cannot be higher than ${formatScore(maximum)}, ${LIMIT_NOUN[kind]}.`;
}

/**
 * True when a numeric score would inflate the percentage.
 * Transfer columns are the one existing exception: they store a prior class
 * percentage, and extra credit can lift that percentage above 100.
 * Extra credit assignments are not an exception — their own total is the bonus.
 */
export function scoreExceedsTotal(
  points: number,
  pointsPossible: number,
  category?: string | null,
): boolean {
  if (!Number.isFinite(points) || !Number.isFinite(pointsPossible)) return true;
  if (isTransferGrade(category)) return points > TRANSFER_SCORE_CAP;
  return points > pointsPossible;
}

/** Null when a discussion's post scores still fit the gradebook column. */
export function discussionTotalError(total: number, pointsPossible: number): string | null {
  if (!Number.isFinite(total) || !Number.isFinite(pointsPossible)) {
    return "Score cannot be saved because the total is missing.";
  }
  if (total > pointsPossible) {
    return `These scores add up to ${formatScore(total)}, which is higher than ${formatScore(pointsPossible)}, the total for this discussion.`;
  }
  return null;
}

/** Null when the number is allowed. Otherwise the message to show on the field. */
export function boundedScoreError(
  points: number,
  maximum: number,
  kind: ScoreLimitKind = "assignment",
): string | null {
  if (!Number.isFinite(points) || points < 0) return "Score must be 0 or more.";
  if (!Number.isFinite(maximum) || maximum < 0) return "Score cannot be saved because the total is missing.";
  if (points > maximum) return overTotalScoreMessage(maximum, kind);
  return null;
}

export type ParsedScore =
  | { ok: true; points: number | null; markCode: string | null }
  | { ok: false; message: string };

/**
 * Parse a teacher-typed gradebook cell.
 * Blank clears the score. A special-mark code stores the mark and no points.
 * A number must be 0 or more and no higher than the assignment total.
 */
export function parseScoreEntry(
  raw: string,
  pointsPossible: number,
  marks: SpecialMark[],
  category?: string | null,
): ParsedScore {
  const text = raw.trim();
  const mark = findMark(text ? text.toUpperCase() : null, marks);
  if (mark) return { ok: true, points: null, markCode: mark.code.toUpperCase() };
  if (text === "") return { ok: true, points: null, markCode: null };

  const points = Number(text);
  if (!Number.isFinite(points)) {
    return {
      ok: false,
      message: marks.length
        ? `Enter a number or a mark code (${marks.map((m) => m.code).join(", ")}).`
        : "Enter a valid score.",
    };
  }
  if (points < 0) return { ok: false, message: "Score must be 0 or more." };
  if (isTransferGrade(category)) {
    if (points > TRANSFER_SCORE_CAP) {
      return { ok: false, message: `Score cannot be higher than ${TRANSFER_SCORE_CAP}.` };
    }
    return { ok: true, points, markCode: null };
  }
  if (!Number.isFinite(pointsPossible)) {
    return { ok: false, message: "Score cannot be saved because the total is missing." };
  }
  if (points > pointsPossible) return { ok: false, message: overTotalScoreMessage(pointsPossible) };
  return { ok: true, points, markCode: null };
}
