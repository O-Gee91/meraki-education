import { describe, expect, it } from "vitest";
import { isTestStudent, sortStudents } from "./student-sort";

describe("test accounts", () => {
  it("pins test accounts to the bottom regardless of name order", () => {
    const list = [
      { id: "1", first_name: "Student", last_name: "Tester" },
      { id: "2", first_name: "Zoe", last_name: "Zhang" },
      { id: "3", first_name: "Amy", last_name: "Adams", is_tester: true },
      { id: "4", first_name: "Ben", last_name: "Brown" },
    ];
    expect(sortStudents(list).map((s) => s.id)).toEqual(["4", "2", "3", "1"]);
    expect(sortStudents(list, "last-desc").slice(0, 2).map((s) => s.id)).toEqual(["2", "4"]);
  });

  it("recognises the flag and the Student Tester name", () => {
    expect(isTestStudent({ first_name: "Student", last_name: "Tester" })).toBe(true);
    expect(isTestStudent({ first_name: "Mia", last_name: "Li", is_tester: true })).toBe(true);
    expect(isTestStudent({ first_name: "Mia", last_name: "Li" })).toBe(false);
  });
});
