import { describe, expect, it } from "vitest";
import { courseworkBucket, isDueSoon } from "./coursework-view";

const today = "2026-11-01";

describe("courseworkBucket", () => {
  it("work due within the next 7 days is current", () => {
    expect(courseworkBucket("2026-11-08", today)).toBe("current");
  });
  it("work due more than 7 days out is current", () => {
    expect(courseworkBucket("2026-12-15", today)).toBe("current");
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
