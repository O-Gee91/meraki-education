import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_MARKS, quickScoreCellValue } from "./grading";
import { discussionPostMax, discussionScoresAfterEdits } from "./discussion";
import {
  boundedScoreError,
  discussionTotalError,
  overTotalScoreMessage,
  parseScoreEntry,
  scoreExceedsTotal,
} from "./score-limit";

describe("ordinary score entry", () => {
  it("keeps a score that is within the assignment total, including full credit", () => {
    expect(parseScoreEntry("18", 20, DEFAULT_MARKS)).toEqual({ ok: true, points: 18, markCode: null });
    expect(parseScoreEntry("20", 20, DEFAULT_MARKS)).toEqual({ ok: true, points: 20, markCode: null });
    expect(parseScoreEntry("20.0", 20, DEFAULT_MARKS).ok && parseScoreEntry("20.0", 20, DEFAULT_MARKS)).toMatchObject({
      ok: true,
      points: 20,
    });
  });

  it("rejects a score above the total and names the maximum", () => {
    const result = parseScoreEntry("21", 20, DEFAULT_MARKS);
    expect(result).toEqual({ ok: false, message: overTotalScoreMessage(20) });
    expect(result.ok === false && result.message).toContain("20");
  });

  it("rejects a quick score that resolves above the total", () => {
    const value = quickScoreCellValue({ label: "Bonus", kind: "points", value: 100 }, 10);
    expect(parseScoreEntry(value, 10, DEFAULT_MARKS)).toEqual({
      ok: false,
      message: "Score cannot be higher than 10, the total for this assignment.",
    });
  });

  it("allows a full-credit quick score and a special mark", () => {
    const full = quickScoreCellValue({ label: "Full credit", kind: "percent", value: 100 }, 10);
    expect(parseScoreEntry(full, 10, DEFAULT_MARKS)).toMatchObject({ ok: true, points: 10 });
    expect(parseScoreEntry("EX", 10, DEFAULT_MARKS)).toEqual({ ok: true, points: null, markCode: "EX" });
    expect(parseScoreEntry("  ", 10, DEFAULT_MARKS)).toEqual({ ok: true, points: null, markCode: null });
  });

  it("rejects a negative or non-numeric score without saving it as zero", () => {
    expect(parseScoreEntry("-1", 10, DEFAULT_MARKS)).toEqual({ ok: false, message: "Score must be 0 or more." });
    expect(parseScoreEntry("abc", 10, [])).toEqual({ ok: false, message: "Enter a valid score." });
  });
});

describe("extra credit and transfer", () => {
  it("caps extra credit at the assignment total", () => {
    expect(scoreExceedsTotal(11, 10, "Extra credit")).toBe(true);
    expect(parseScoreEntry("11", 10, DEFAULT_MARKS, "extra credit").ok).toBe(false);
    expect(parseScoreEntry("10", 10, DEFAULT_MARKS, "Extra credit")).toMatchObject({ ok: true, points: 10 });
  });

  it("lets a transfer column store a percentage that extra credit lifted above 100", () => {
    expect(scoreExceedsTotal(105.4, 100, "Transfer")).toBe(false);
    expect(parseScoreEntry("105.4", 100, DEFAULT_MARKS, "transfer")).toMatchObject({ ok: true, points: 105.4 });
    expect(parseScoreEntry("10001", 100, DEFAULT_MARKS, "Transfer")).toEqual({
      ok: false,
      message: "Score cannot be higher than 10000.",
    });
  });
});

describe("discussion and question totals", () => {
  it("caps each discussion post at its own maximum", () => {
    expect(discussionPostMax({ pointsPossible: 10, responsePoints: 6, replyPoints: 2, isReply: false })).toBe(6);
    expect(discussionPostMax({ pointsPossible: 10, responsePoints: 6, replyPoints: 2, isReply: true })).toBe(2);
    expect(boundedScoreError(7, 6, "response")).toBe("Score cannot be higher than 6, the total for this response.");
    expect(boundedScoreError(2, 2, "reply")).toBeNull();
  });

  it("rejects a discussion total that extra replies would push over the gradebook column", () => {
    const total = discussionScoresAfterEdits(
      [
        { postId: "main", points: 6 },
        { postId: "reply-1", points: 2 },
        { postId: "reply-2", points: 2 },
      ],
      [{ postId: "reply-3", points: 2 }],
    );
    expect(total).toBe(12);
    expect(discussionTotalError(12, 10)).toBe(
      "These scores add up to 12, which is higher than 10, the total for this discussion.",
    );
    expect(discussionTotalError(10, 10)).toBeNull();
  });

  it("caps an essay question at its own points", () => {
    expect(boundedScoreError(8, 5, "question")).toBe("Score cannot be higher than 5, the total for this question.");
    expect(boundedScoreError(5, 5, "question")).toBeNull();
  });
});

describe("database enforcement", () => {
  const drizzle = readFileSync("drizzle/migrations/0043_reject_over_total_scores.sql", "utf8");
  const supabase = readFileSync("supabase/migrations/20261126120000_reject_over_total_scores.sql", "utf8");

  it("ships the same trigger in both migration tracks", () => {
    expect(supabase).toBe(drizzle);
  });

  it("rejects over-total grades, discussion scores, and assessment scores in the database", () => {
    expect(drizzle).toContain("CREATE TRIGGER grades_reject_over_total");
    expect(drizzle).toContain("BEFORE INSERT OR UPDATE ON public.grades");
    expect(drizzle).toContain("Score cannot be higher than %, the total for this assignment.");
    expect(drizzle).toContain("CREATE TRIGGER discussion_scores_reject_over_total");
    expect(drizzle).toContain("CREATE TRIGGER assessment_answers_reject_over_total");
    expect(drizzle).toContain("CREATE TRIGGER assessment_submissions_reject_over_total");
    expect(drizzle).toContain("CREATE TRIGGER assignments_reject_shrinking_total");
  });

  it("exempts only transfer columns, not extra credit", () => {
    expect(drizzle).toContain("WHEN n::text LIKE '%.%'");
    expect(drizzle).toContain("lower(btrim(coalesce(category, ''))) = 'transfer'");
    expect(drizzle).toContain("Extra credit assignments");
    expect(drizzle).toContain("stay capped at their own total");
    expect(drizzle).not.toContain("= 'extra credit'");
  });
});
