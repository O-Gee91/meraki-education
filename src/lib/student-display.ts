import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "meraki.roster-privacy";

export type NamedStudent = {
  first_name?: string | null;
  last_name?: string | null;
  student_number?: string | null;
};

/** "Doe, Jane" — or the student ID when privacy mode is on. Pulse keeps this wording. */
export function studentLabel(student: NamedStudent | null | undefined, useIds: boolean) {
  if (!student) return "—";
  const name = `${student.last_name ?? ""}, ${student.first_name ?? ""}`.replace(/^, |, $/g, "");
  if (!useIds) return name || "—";
  return student.student_number?.trim() ? `ID ${student.student_number.trim()}` : "No ID";
}

/** Screen-reader and class-roster wording for a student ID. */
export function studentIdText(student: NamedStudent | null | undefined) {
  const number = student?.student_number?.trim();
  return number ? `Student ID ${number}` : "No ID";
}

/** Class tools name. With IDs on, the accessible text is "Student ID {number}". */
export function rosterDisplayName(student: NamedStudent | null | undefined, useIds: boolean) {
  if (!useIds) return studentLabel(student, false);
  return studentIdText(student);
}

/** Shorter form used in tight spaces such as seating charts. */
export function studentShortLabel(student: NamedStudent | null | undefined, useIds: boolean) {
  if (!student) return "empty";
  if (useIds) return student.student_number?.trim() ? student.student_number.trim() : "No ID";
  return `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "unnamed";
}

/** Remembers the teacher's name/ID preference across visits. */
export function useRosterPrivacy() {
  const [useIds, setUseIds] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUseIds(window.localStorage.getItem(STORAGE_KEY) === "ids");
  }, []);

  const toggle = useCallback(() => {
    setUseIds((prev) => {
      const next = !prev;
      if (typeof window !== "undefined")
        window.localStorage.setItem(STORAGE_KEY, next ? "ids" : "names");
      return next;
    });
  }, []);

  return { useIds, toggle };
}
