import { createContext, useContext } from "react";

/**
 * When a teacher clicks "View as student" on a class page, this carries the
 * demo Student Tester's id so student-facing screens show that account's work
 * instead of looking up the signed-in teacher's own student record.
 */
export const StudentPreviewContext = createContext<string | null>(null);

export function useStudentPreviewId() {
  return useContext(StudentPreviewContext);
}
