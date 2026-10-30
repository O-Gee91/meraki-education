import { describe, expect, it } from "vitest";
import { isUpcoming } from "./calendar-coursework";

describe("isUpcoming", () => {
  it("hides items dated before today", () => {
    expect(isUpcoming({ date: "2026-10-29" }, "2026-10-30", "09:00")).toBe(false);
  });
  it("keeps untimed items for all of today", () => {
    expect(isUpcoming({ date: "2026-10-30" }, "2026-10-30", "23:30")).toBe(true);
  });
  it("hides a timed event today once its time has passed", () => {
    expect(isUpcoming({ date: "2026-10-30", endTime: "14:00:00" }, "2026-10-30", "14:30")).toBe(false);
    expect(isUpcoming({ date: "2026-10-30", endTime: "14:00:00" }, "2026-10-30", "13:59")).toBe(true);
  });
  it("keeps future items", () => {
    expect(isUpcoming({ date: "2026-11-02" }, "2026-10-30", "23:59")).toBe(true);
  });
});
