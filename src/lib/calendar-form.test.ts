import { describe, expect, it } from "vitest";
import type { Audience } from "@/lib/audience";
import { withCalendarAudience, withCalendarCategory, withCalendarColor } from "./calendar-form";

const holiday = { category: "holiday", color: "navy", audiences: ["everyone"] as Audience[] };

describe("calendar holiday visibility", () => {
  it("keeps a blue holiday visible to everyone when its blue chip is clicked", () => {
    expect(withCalendarColor(holiday, "navy")).toEqual(holiday);
  });
  it("keeps holiday blue when Everyone is selected", () => {
    expect(withCalendarAudience({ ...holiday, audiences: ["teachers"] }, "everyone")).toEqual(holiday);
  });
  it("resets a staff meeting to a blue public holiday", () => {
    expect(withCalendarCategory({ category: "meeting", color: "navy", audiences: ["teachers"] }, "holiday")).toEqual(holiday);
  });
  it("allows explicitly staff-only holidays without color clicks reopening them", () => {
    const staffHoliday = withCalendarAudience(holiday, "teachers");
    expect(withCalendarColor(staffHoliday, "navy").audiences).toEqual(["teachers"]);
  });
  it("preserves staff-only meeting defaults", () => {
    expect(withCalendarCategory(holiday, "meeting")).toEqual({ category: "meeting", color: "navy", audiences: ["teachers"] });
  });
  it("still makes non-holiday blue events staff-only", () => {
    expect(withCalendarColor({ ...holiday, category: "event", color: "amber" }, "navy").audiences).toEqual(["teachers"]);
  });
});