import { describe, expect, it } from "vitest";
import { courseworkBucket, isDueSoon, needsCourseworkAttention } from "./coursework-view";

const today = "2026-11-01";

describe("coursework attention", () => {
  it("includes an item with zero ungraded students and one draft grade to post", () => {
    expect(needsCourseworkAttention(0, 1)).toBe(true);
  });
  it("includes one ungraded student", () => {
    expect(needsCourseworkAttention(1, 0)).toBe(true);
  });
  it("excludes fully posted and graded work", () => {
    expect(needsCourseworkAttention(0, 0)).toBe(false);
  });
});

describe("courseworkBucket", () => {
  it("work due within the next 7 days is current", () => {
    expect(courseworkBucket("2026-11-08", today)).toBe("current");
  });
  it("work due more than 7 days out is upcoming", () => {
    expect(courseworkBucket("2026-12-15", today)).toBe("upcoming");
    expect(courseworkBucket("2026-11-09", today)).toBe("upcoming");
  });
  it("work due more than 7 days ago is past", () => {
    expect(courseworkBucket("2026-10-24", today)).toBe("past");
  });
  it("old work still needing grading stays current", () => {
    expect(courseworkBucket("2026-10-01", today, true)).toBe("current");
  });
  it("undated work is current", () => {
    expect(courseworkBucket(null, today)).toBe("current");
  });
});

describe("isDueSoon", () => {
  it("includes today through 7 days ahead only", () => {
    expect(isDueSoon("2026-11-01", today)).toBe(true);
    expect(isDueSoon("2026-11-08", today)).toBe(true);
    expect(isDueSoon("2026-11-09", today)).toBe(false);
    expect(isDueSoon("2026-10-31", today)).toBe(false);
  });
});
