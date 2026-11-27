import { describe, expect, it } from "vitest";
import { discussionPastDue, dueDateEndIso, isLateAt } from "./coursework-window";

const shanghai = "Asia/Shanghai";

describe("class-zone due times", () => {
  it("treats a quiz with only a past due date as late", () => {
    const beforeEnd = Date.parse("2026-11-26T15:00:00.000Z");
    const afterEnd = Date.parse("2026-11-26T16:00:00.000Z");
    expect(isLateAt(beforeEnd, null, "2026-11-26", shanghai)).toBe(false);
    expect(isLateAt(afterEnd, null, "2026-11-26", shanghai)).toBe(true);
    expect(isLateAt(afterEnd, null, null, shanghai)).toBe(false);
  });

  it("saves an assessment due date at 23:59 in the class zone", () => {
    expect(dueDateEndIso("2026-11-26", shanghai)).toBe("2026-11-26T15:59:00.000Z");
  });

  it("marks a discussion past due at the end of the class day, not browser-local time", () => {
    const beforeEnd = Date.parse("2026-11-26T15:00:00.000Z");
    const afterEnd = Date.parse("2026-11-26T16:00:00.000Z");
    expect(discussionPastDue({ due_date: "2026-11-26", due_at: null }, shanghai, beforeEnd)).toBe(false);
    expect(discussionPastDue({ due_date: "2026-11-26", due_at: null }, shanghai, afterEnd)).toBe(true);
    expect(discussionPastDue({ due_at: "2026-11-26T15:59:00.000Z", due_date: null }, shanghai, afterEnd)).toBe(true);
  });
});
