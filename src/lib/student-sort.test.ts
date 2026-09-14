import { describe, expect, it } from "vitest";
import { sortStudents, type SortableStudent } from "./student-sort";

const students: SortableStudent[] = [
  { id: "6", first_name: " Zoë ", last_name: "O'Brien" },
  { id: "3", first_name: "Ana", last_name: "Éclair" },
  { id: "2", first_name: "Bea", last_name: "eclair" },
  { id: "5", first_name: "Mina", last_name: "Smith-Jones" },
  { id: "4", first_name: "Alex", last_name: "Smith-Jones" },
  { id: "1", first_name: "Student 10", last_name: "" },
];

describe("student name sorting", () => {
  it("uses locale-aware names, trims whitespace, ties on the other name, and leaves blanks last", () => {
    expect(sortStudents(students).map((student) => student.id)).toEqual(["3", "2", "6", "4", "5", "1"]);
  });

  it("supports first-name descending while keeping missing primary names last", () => {
    const input = [...students, { id: "7", first_name: "", last_name: "Named" }];
    expect(sortStudents(input, "first-desc").at(-1)?.id).toBe("7");
  });

  it("uses IDs as a deterministic tiebreaker for duplicate names", () => {
    const duplicates = [
      { id: "b", first_name: "Sam", last_name: "Lee" },
      { id: "a", first_name: "sam", last_name: "lee" },
    ];
    expect(sortStudents(duplicates).map((student) => student.id)).toEqual(["a", "b"]);
  });
});