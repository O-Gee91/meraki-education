import { createContext, useContext, useEffect, useState } from "react";

/**
 * When a teacher clicks "View as student" on a class page, this carries the
 * demo Student Tester's id so student-facing screens show that account's work
 * instead of looking up the signed-in teacher's own student record.
 */
export const StudentPreviewContext = createContext<string | null>(null);

export function useStudentPreviewId() {
  return useContext(StudentPreviewContext);
}

/*
 * Global "View as student" switch for staff. Kept in sessionStorage so it
 * survives page navigation but ends with the browser tab. It never changes
 * the signed-in account — it only tells the UI to render student screens
 * scoped to the demo Student Tester record.
 */
const STORAGE_KEY = "meraki-student-preview";
let active = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function useStudentPreviewMode() {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      active = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* private mode */
    }
    const listener = () => setValue(active);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

export function setStudentPreviewMode(next: boolean) {
  active = next;
  try {
    if (next) window.sessionStorage.setItem(STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  emit();
}

export const PREVIEW_READ_ONLY = "Student view is a read-only preview — exit it to make changes.";
