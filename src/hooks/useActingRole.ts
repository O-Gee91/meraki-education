import { useEffect, useState } from "react";

export type StaffRole = "admin" | "teacher";

const STORAGE_KEY = "meraki-acting-role";

let current: StaffRole | null = null;
const listeners = new Set<() => void>();

function readStored(): StaffRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "admin" || raw === "teacher" ? raw : null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  current = readStored();
}

/**
 * Staff who hold both admin and teacher roles can choose which hat they are
 * wearing. The choice narrows what the UI offers and, crucially, which audience
 * new announcements/calendar entries default to: school-wide as an admin, class
 * scoped as a teacher.
 */
export function useActingRoleStore() {
  const [value, setValue] = useState<StaffRole | null>(current);

  useEffect(() => {
    const listener = () => setValue(current);
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
  }, []);

  return value;
}

export function setActingRole(next: StaffRole) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  for (const listener of listeners) listener();
}

export function clearActingRole() {
  current = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  for (const listener of listeners) listener();
}
