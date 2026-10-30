import { describe, expect, it } from "vitest";
import { isMissingWork } from "./missing-work";

const today = "2026-10-30";
const pastDue = { due_date: "2026-10-20", created_at: "2026-10-10", status: "published" };

describe("isMissingWork", () => {
  it("counts a teacher M mark even before the due date", () => {
    expect(isMissingWork({ assignment: { due_date: "2026-11-30" }, grade: { comment: "MARK:M" }, today })).toBe(true);
  });
  it("never counts excused work", () => {
    expect(isMissingWork({ assignment: pastDue, grade: { comment: "MARK:EX" }, today })).toBe(false);
  });
  it("counts past-due published work with nothing turned in", () => {
    expect(isMissingWork({ assignment: pastDue, today })).toBe(true);
  });
  it("does not count submitted work", () => {
    expect(isMissingWork({ assignment: pastDue, submitted: true, today })).toBe(false);
  });
  it("does not count a posted zero", () => {
    expect(isMissingWork({ assignment: pastDue, grade: { points_earned: 0 }, today })).toBe(false);
  });
  it("does not count draft assignments", () => {
    expect(isMissingWork({ assignment: { ...pastDue, status: "draft" }, today })).toBe(false);
  });
  it("does not count backdated work", () => {
    expect(isMissingWork({ assignment: { ...pastDue, created_at: "2026-10-25" }, today })).toBe(false);
  });
});
