import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP } from "./grading";
import { officialAverage, postedGradeFields, printStanding } from "./official-average";
import { columnPercents, scoredPercent } from "./scored-percent";

const tz = "Asia/Shanghai";
const on = (day: string) => new Date(`${day}T04:00:00Z`);
const penalty = {
  id: "a1",
  category: "Homework",
  points_possible: 100,
  due_date: "2026-11-10",
  late_penalty_enabled: true,
  late_penalty_mode: "percent",
  late_penalty_per_day: 5,
  late_penalty_zero_after_days: 6,
};

describe("official averages", () => {
  it("ignores a draft that is still visible as a cell value", () => {
    const grades = [
      { assignment_id: "a1", student_id: "s1", points_earned: 40, comment: null, is_draft: true },
    ];
    expect(officialAverage([penalty], grades, "s1", DEFAULT_SETUP, tz, on("2026-11-13"))).toBeNull();
    expect(grades[0]?.points_earned).toBe(40);
    expect(grades[0]?.is_draft).toBe(true);
  });

  it("counts a posted score and leaves the draft off the percentage", () => {
    const grades = [
      { assignment_id: "posted", student_id: "s1", points_earned: 100, comment: null, is_draft: false },
      { assignment_id: "draft", student_id: "s1", points_earned: 0, comment: null, is_draft: true },
    ];
    const assignments = [
      { ...penalty, id: "posted" },
      { ...penalty, id: "draft", late_penalty_enabled: false },
    ];
    expect(officialAverage(assignments, grades, "s1", DEFAULT_SETUP, tz, on("2026-11-13"))).toBe(100);
  });

  it("values a posted Missing mark with missingPointsFor in the class zone", () => {
    const grades = [
      { assignment_id: "a1", student_id: "s1", points_earned: null, comment: "MARK:M", is_draft: false },
    ];
    expect(officialAverage([penalty], grades, "s1", DEFAULT_SETUP, tz, on("2026-11-13"))).toBe(85);
  });
});

describe("saveScore posting", () => {
  it("sets is_draft false, posted_at, and posted_by", () => {
    expect(postedGradeFields("teacher-1", "2026-11-26T07:00:00.000Z")).toEqual({
      is_draft: false,
      posted_at: "2026-11-26T07:00:00.000Z",
      posted_by: "teacher-1",
      updated_at: "2026-11-26T07:00:00.000Z",
    });
  });
});

describe("column and coursework means", () => {
  it("uses missingPointsFor for M and skips testers, dropped students, and drafts", () => {
    const grades = [
      { assignment_id: "a1", student_id: "active", points_earned: null, comment: "MARK:M", is_draft: false },
      { assignment_id: "a1", student_id: "tester", points_earned: 0, comment: null, is_draft: false },
      { assignment_id: "a1", student_id: "dropped", points_earned: 0, comment: null, is_draft: false },
      { assignment_id: "a1", student_id: "active", points_earned: 100, comment: null, is_draft: true },
    ];
    const counted = new Set(["active"]);
    const percents = columnPercents(penalty, grades, counted, DEFAULT_SETUP.marks, tz, on("2026-11-13"));
    expect(percents).toEqual([85]);
    expect(scoredPercent(penalty, grades[0]!, DEFAULT_SETUP.marks, tz, on("2026-11-13"))).toBe(85);
    expect(scoredPercent({ ...penalty, late_penalty_enabled: false }, grades[0]!, DEFAULT_SETUP.marks, tz, on("2026-11-13"))).toBe(0);
  });
});

describe("printed standing", () => {
  it("counts missing work on the same assignment list as the percentage", () => {
    const assignments = [
      { ...penalty, id: "scored", late_penalty_enabled: false, due_date: "2026-11-01", created_at: "2026-10-01", status: "published" },
      { ...penalty, id: "missing", late_penalty_enabled: false, due_date: "2026-11-01", created_at: "2026-10-01", status: "published" },
    ];
    const grades = [
      { assignment_id: "scored", student_id: "s1", points_earned: 100, comment: null, is_draft: false },
      { assignment_id: "missing", student_id: "s1", points_earned: 0, comment: null, is_draft: true },
    ];
    const full = printStanding({
      assignments,
      grades,
      studentId: "s1",
      setup: DEFAULT_SETUP,
      timeZone: tz,
      today: "2026-11-20",
      submitted: () => false,
    });
    const filteredColumns = printStanding({
      assignments: assignments.filter((assignment) => assignment.id === "scored"),
      grades,
      studentId: "s1",
      setup: DEFAULT_SETUP,
      timeZone: tz,
      today: "2026-11-20",
      submitted: () => false,
    });
    expect(full.percent).toBe(100);
    expect(full.missing).toBe(1);
    expect(filteredColumns.missing).toBe(0);
  });
});
