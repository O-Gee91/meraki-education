import { describe, expect, it } from "vitest";
import {
  attentionFailureLabel,
  presentCount,
  pulseReadPlan,
  readState,
  teacherTodayDetail,
} from "./class-pulse";

const staff = {
  staffView: true,
  parentSuppliesMissing: true,
  assignmentCount: 26,
  rosterCount: 24,
  checkInStudentId: null as string | null,
};

describe("class pulse reads", () => {
  it("does not re-read submissions when the gradebook already supplied missing work", () => {
    expect(pulseReadPlan(staff)).toEqual(["attendance", "behavior", "wellbeing"]);
  });

  it("still reads submissions for a student or preview, and skips staff-only tallies", () => {
    const family = pulseReadPlan({ ...staff, staffView: false, parentSuppliesMissing: false });
    expect(family).toEqual(["submissions"]);
    expect(family).not.toContain("attendance");
    expect(family).not.toContain("behavior");
    expect(family).not.toContain("wellbeing");
    expect(family).not.toContain("student-links");
  });

  it("waits to load check-in contacts until a student is selected", () => {
    expect(pulseReadPlan(staff)).not.toContain("student-links");
    expect(pulseReadPlan({ ...staff, checkInStudentId: "student-1" })).toContain("student-links");
  });

  it("skips submission and behavior reads when there is nothing to ask for", () => {
    expect(
      pulseReadPlan({ ...staff, parentSuppliesMissing: false, assignmentCount: 0, rosterCount: 0 }),
    ).toEqual(["attendance", "wellbeing"]);
  });
});

describe("attention counts", () => {
  it("keeps a failed or unfinished read from looking like zero", () => {
    expect(presentCount("error", 0)).toBe("Couldn't load");
    expect(presentCount("loading", 0)).toBe("…");
    expect(presentCount("ready", 0)).toBe("0");
    expect(presentCount("ready", "0/23")).toBe("0/23");
  });

  it("treats a query that was not started as ready, and a failed query as an error", () => {
    expect(readState(false, { isError: false, isSuccess: false })).toBe("ready");
    expect(readState(true, { isError: true, isSuccess: false })).toBe("error");
    expect(readState(true, { isError: false, isSuccess: false })).toBe("loading");
    expect(readState(true, { isError: false, isSuccess: true })).toBe("ready");
  });

  it("names the reads that failed without turning them into empty counts", () => {
    expect(attentionFailureLabel([])).toBeNull();
    expect(attentionFailureLabel(["grades and missing work"])).toBe(
      "Grades and missing work couldn't be loaded. Those counts stay blank until the read succeeds.",
    );
    expect(attentionFailureLabel(["attendance", "behavior"])).toBe(
      "Attendance and behavior couldn't be loaded. Those counts stay blank until the read succeeds.",
    );
  });
});

describe("teacher today layout", () => {
  it("shows only the strip until a teacher asks for a detail", () => {
    expect(teacherTodayDetail(null, false)).toEqual({
      students: false,
      missingList: false,
      behaviorNotes: false,
    });
  });

  it("opens missing work as one list, not a second grid", () => {
    expect(teacherTodayDetail("missing", true)).toEqual({
      students: false,
      missingList: true,
      behaviorNotes: false,
    });
  });

  it("opens behavior notes with the matching students, and pulse alone without them", () => {
    expect(teacherTodayDetail("behavior", false)).toEqual({
      students: true,
      missingList: false,
      behaviorNotes: true,
    });
    expect(teacherTodayDetail(null, true)).toEqual({
      students: true,
      missingList: false,
      behaviorNotes: false,
    });
    expect(teacherTodayDetail("attendance", false).missingList).toBe(false);
    expect(teacherTodayDetail("wellbeing", false).behaviorNotes).toBe(false);
  });
});
