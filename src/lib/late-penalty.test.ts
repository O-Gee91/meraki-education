import { describe, expect, it } from "vitest";
import { computeAverage, DEFAULT_SETUP } from "./grading";
import { daysLate, missingMarkValue, missingPointsFor } from "./late-penalty";

const tz = "Asia/Shanghai";
const a = {
  late_penalty_enabled: true,
  late_penalty_mode: "percent",
  late_penalty_per_day: 5,
  late_penalty_zero_after_days: 6,
  due_date: "2026-11-10",
  points_possible: 100,
};
// Noon in Shanghai on the given date.
const on = (d: string) => new Date(`${d}T04:00:00Z`);

describe("late penalty for Missing", () => {
  it("is full value on the due date", () => {
    expect(missingMarkValue(a, on("2026-11-10"), tz)?.points).toBe(100);
  });
  it("due date ends at 11:59 pm class time", () => {
    expect(daysLate("2026-11-10", new Date("2026-11-10T15:59:00Z"), tz)).toBe(0);
    expect(daysLate("2026-11-10", new Date("2026-11-10T16:01:00Z"), tz)).toBe(1);
  });
  it("1 day late removes one daily amount", () => {
    expect(missingMarkValue(a, on("2026-11-11"), tz)?.points).toBe(95);
  });
  it("X-1 days late still has partial value", () => {
    expect(missingMarkValue(a, on("2026-11-15"), tz)?.points).toBe(75);
  });
  it("X days late counts as 0", () => {
    expect(missingMarkValue(a, on("2026-11-16"), tz)?.points).toBe(0);
  });
  it("beyond X days stays 0", () => {
    expect(missingMarkValue(a, on("2026-11-30"), tz)?.points).toBe(0);
  });
  it("points mode deducts raw points", () => {
    const p = { ...a, late_penalty_mode: "points", late_penalty_per_day: 3, points_possible: 20 };
    expect(missingMarkValue(p, on("2026-11-13"), tz)?.points).toBe(11);
  });
  it("penalty off keeps M at 0 in averages", () => {
    const off = { ...a, late_penalty_enabled: false };
    expect(missingPointsFor(off, tz, on("2026-11-11"))).toBeUndefined();
    const avg = computeAverage(
      [{ category: "Homework", pointsPossible: 100, pointsEarned: null, markCode: "M", missingPoints: missingPointsFor(off, tz, on("2026-11-11")) }],
      DEFAULT_SETUP,
    );
    expect(avg).toBe(0);
  });
  it("M with penalty counts as reduced score in averages", () => {
    const avg = computeAverage(
      [{ category: "Homework", pointsPossible: 100, pointsEarned: null, markCode: "M", missingPoints: missingPointsFor(a, tz, on("2026-11-13")) }],
      DEFAULT_SETUP,
    );
    expect(avg).toBe(85);
  });
  it("excused work is never penalized", () => {
    const avg = computeAverage(
      [
        { category: "Homework", pointsPossible: 100, pointsEarned: null, markCode: "EX", missingPoints: 85 },
        { category: "Homework", pointsPossible: 100, pointsEarned: 90, markCode: null },
      ],
      DEFAULT_SETUP,
    );
    expect(avg).toBe(90);
  });
  it("a real score is used as entered, not penalized", () => {
    const avg = computeAverage(
      [{ category: "Homework", pointsPossible: 100, pointsEarned: 100, markCode: null, missingPoints: 50 }],
      DEFAULT_SETUP,
    );
    expect(avg).toBe(100);
  });
});
