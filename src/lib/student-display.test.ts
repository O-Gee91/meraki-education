import { describe, expect, it } from "vitest";
import {
  rosterDisplayName,
  studentIdText,
  studentLabel,
  studentShortLabel,
  type NamedStudent,
} from "@/lib/student-display";

const jones: NamedStudent = { first_name: "Jane", last_name: "Doe", student_number: "MK0000422" };
const noNumber: NamedStudent = { first_name: "Sam", last_name: "Ray", student_number: null };

describe("roster privacy display", () => {
  it("shows the bare ID number, not a label, when IDs are on", () => {
    expect(rosterDisplayName(jones, true)).toBe("MK0000422");
    expect(studentLabel(jones, true)).toBe("MK0000422");
    expect(studentShortLabel(jones, true)).toBe("MK0000422");
  });

  it("shows names when IDs are off", () => {
    expect(rosterDisplayName(jones, false)).toBe("Doe, Jane");
    expect(studentLabel(jones, false)).toBe("Doe, Jane");
    expect(studentShortLabel(jones, false)).toBe("Jane Doe");
  });

  it("falls back to No ID when the number is missing or blank", () => {
    expect(rosterDisplayName(noNumber, true)).toBe("No ID");
    expect(rosterDisplayName({ first_name: "A", last_name: "B", student_number: "   " }, true)).toBe("No ID");
    expect(studentLabel(noNumber, true)).toBe("No ID");
  });

  it("keeps the screen-reader wording that names the number", () => {
    expect(studentIdText(jones)).toBe("Student ID MK0000422");
    expect(studentIdText(noNumber)).toBe("No ID");
  });
});
