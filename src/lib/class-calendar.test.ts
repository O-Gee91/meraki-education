import { describe, expect, it } from "vitest";
import { classCalendarDate } from "./late-penalty";
import { isMissingWork } from "./missing-work";

describe("class calendar date", () => {
  it("keeps 15:00 UTC on 26 Nov as 26 Nov in Shanghai", () => {
    const instant = new Date("2026-11-26T15:00:00.000Z");
    expect(classCalendarDate(instant, "Asia/Shanghai")).toBe("2026-11-26");
    expect(classCalendarDate(instant)).toBe("2026-11-26");
  });

  it("is already 27 Nov in Shanghai at 16:00 UTC on 26 Nov, while UTC is still 26 Nov", () => {
    const instant = new Date("2026-11-26T16:00:00.000Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-11-26");
    expect(classCalendarDate(instant, "Asia/Shanghai")).toBe("2026-11-27");
  });

  it("flags missing work from the class date, including the grace day", () => {
    const assignment = { due_date: "2026-11-25", created_at: "2026-11-01", status: "published" };
    const shanghaiMidnight = new Date("2026-11-26T16:00:00.000Z");
    const classToday = classCalendarDate(shanghaiMidnight, "Asia/Shanghai");
    const utcToday = shanghaiMidnight.toISOString().slice(0, 10);
    expect(classToday).toBe("2026-11-27");
    expect(utcToday).toBe("2026-11-26");
    expect(isMissingWork({ assignment, today: classToday })).toBe(true);
    expect(isMissingWork({ assignment, today: utcToday })).toBe(false);
    expect(isMissingWork({ assignment, today: classCalendarDate(new Date("2026-11-26T15:00:00.000Z"), "Asia/Shanghai") })).toBe(false);
  });
});
