/**
 * Meraki student IDs. The public number is `students.student_number`.
 * Newly issued values are MK + a 6-digit sequence body + an ISO/IEC 7812 Luhn
 * check digit (body 000042 → MK0000422). The check digit is not derived from
 * a name, date of birth, email, username, or SSN.
 *
 * MK0000420 is the shape people expect to see, and it does not pass ISO Luhn.
 * Issued IDs use the check digit that does. Imported legacy values may keep
 * another shape, and they are never overwritten by issuance.
 */

export const STUDENT_NUMBER_MAX = 40;

export const STUDENT_STATUSES = [
  "active",
  "withdrawn",
  "transferred_out",
  "graduated",
  "no_show",
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Active",
  withdrawn: "Withdrawn",
  transferred_out: "Transferred out",
  graduated: "Graduated",
  no_show: "No-show",
};

export type StudentNumberIssuer = "issued" | "imported" | "corrected";

const MERAKI_ISSUED = /^MK\d{7}$/;

/** Search boxes use this so a too-long paste does not throw during render. */
export function tryNormalizeStudentNumber(raw: string | null | undefined): string | null {
  try {
    return normalizeStudentNumber(raw);
  } catch {
    return null;
  }
}

/** Trim, drop internal whitespace, and uppercase. Empty becomes null. */
export function normalizeStudentNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.trim().replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return null;
  if (cleaned.length > STUDENT_NUMBER_MAX) {
    throw new Error("Student ID must be 40 characters or fewer.");
  }
  return cleaned;
}

/**
 * ISO/IEC 7812 check digit. The payload's rightmost digit is doubled, because
 * the appended check digit itself is not doubled when the full number is validated.
 */
export function luhnCheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new Error("Student ID body must be digits.");
  let sum = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    let digit = body.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isMerakiShaped(number: string): boolean {
  return MERAKI_ISSUED.test(number);
}

/** True only for IDs this school issued: MK, 6-digit body, valid Luhn check. */
export function isValidIssuedStudentNumber(number: string | null | undefined): boolean {
  if (!number || !isMerakiShaped(number)) return false;
  const body = number.slice(2, 8);
  return number.slice(8) === luhnCheckDigit(body) && luhnValid(number.slice(2));
}

/** MK + zero-padded body + Luhn check. Body 42 → MK0000422. */
export function formatIssuedStudentNumber(body: number): string {
  if (!Number.isInteger(body) || body < 1 || body > 999999) {
    throw new Error("Student ID numbers are exhausted.");
  }
  const digits = String(body).padStart(6, "0");
  return `MK${digits}${luhnCheckDigit(digits)}`;
}

export function issuedBody(number: string): number | null {
  if (!isMerakiShaped(number)) return null;
  return Number(number.slice(2, 8));
}

/**
 * Next MK id at or after `startBody`, skipping numbers already on a student
 * or already retired. `nextBody` is the first sequence value not consumed.
 */
export function nextIssuedStudentNumber(
  startBody: number,
  taken: ReadonlySet<string>,
): { number: string; nextBody: number } {
  let body = startBody;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (body > 999999) throw new Error("Student ID numbers are exhausted.");
    const candidate = formatIssuedStudentNumber(body);
    body += 1;
    if (!taken.has(candidate)) return { number: candidate, nextBody: body };
  }
  throw new Error("Could not issue a student ID.");
}

/** Idempotent: a student who already has a number keeps it. */
export function planIssuance(
  student: { student_number: string | null | undefined },
  startBody: number,
  taken: ReadonlySet<string>,
): { studentNumber: string; nextBody: number; issued: boolean } {
  const existing = normalizeStudentNumber(student.student_number);
  if (existing) return { studentNumber: existing, nextBody: startBody, issued: false };
  const next = nextIssuedStudentNumber(startBody, taken);
  return { studentNumber: next.number, nextBody: next.nextBody, issued: true };
}

export type NumberedStudent = {
  id: string;
  created_at: string;
  student_number: string | null;
};

/**
 * Shared numbers: the earliest created_at row keeps the value (id breaks ties).
 * Every later row must be issued a new ID. The shared value stays in use, so it
 * is not retired.
 */
export function planDuplicateBackfill(rows: NumberedStudent[]): {
  keep: { id: string; student_number: string; issuer: "imported" }[];
  reissue: { id: string; old_number: string }[];
} {
  const groups = new Map<string, { id: string; created_at: string }[]>();
  for (const row of rows) {
    let number: string | null;
    try {
      number = normalizeStudentNumber(row.student_number);
    } catch {
      number = row.student_number?.trim().slice(0, STUDENT_NUMBER_MAX).toUpperCase() || null;
    }
    if (!number) continue;
    const list = groups.get(number) ?? [];
    list.push({ id: row.id, created_at: row.created_at });
    groups.set(number, list);
  }
  const keep: { id: string; student_number: string; issuer: "imported" }[] = [];
  const reissue: { id: string; old_number: string }[] = [];
  for (const [student_number, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    const [first, ...rest] = sorted;
    if (!first) continue;
    keep.push({ id: first.id, student_number, issuer: "imported" });
    for (const extra of rest) reissue.push({ id: extra.id, old_number: student_number });
  }
  return { keep, reissue };
}

export type ImportLookup = {
  in_use: boolean;
  retired: boolean;
  /** Set only when this caller may update that student. */
  managed_id: string | null;
};

export type ImportSourceRow = {
  first_name: string;
  last_name: string;
  grade_level: number;
  student_number?: string | null | undefined;
  chinese_name?: string | null | undefined;
  guardian_email?: string | null | undefined;
};

export type ImportPlan =
  | {
      action: "insert";
      studentNumber: string | null;
      issuer: "imported" | "issued";
      row: ImportSourceRow;
    }
  | {
      action: "match";
      studentId: string;
      studentNumber: string;
      /** Matching never writes a new student_number onto the existing row. */
      overwriteNumber: false;
      row: ImportSourceRow;
    }
  | { action: "reject"; studentNumber: string | null; reason: string; row: ImportSourceRow };

/**
 * Match a returning student on student_number only. A blank ID is a new student
 * even when the name matches someone already on file. A number the caller cannot
 * manage is rejected without using that other student's name.
 */
export function planStudentImport(
  rows: ImportSourceRow[],
  lookup: ReadonlyMap<string, ImportLookup>,
): ImportPlan[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const studentNumber = normalizeStudentNumber(row.student_number);
    if (!studentNumber) {
      return { action: "insert", studentNumber: null, issuer: "issued", row };
    }
    if (seen.has(studentNumber)) {
      return {
        action: "reject",
        studentNumber,
        reason: `Student ID ${studentNumber} appears more than once in this file.`,
        row,
      };
    }
    seen.add(studentNumber);
    const found = lookup.get(studentNumber);
    if (found?.retired) {
      return {
        action: "reject",
        studentNumber,
        reason: `Student ID ${studentNumber} was retired and cannot be reused.`,
        row,
      };
    }
    if (found?.in_use) {
      if (!found.managed_id) {
        return {
          action: "reject",
          studentNumber,
          reason: `Student ID ${studentNumber} is already assigned. An administrator has to update that record.`,
          row,
        };
      }
      return {
        action: "match",
        studentId: found.managed_id,
        studentNumber,
        overwriteNumber: false,
        row,
      };
    }
    return { action: "insert", studentNumber, issuer: "imported", row };
  });
}

/** Fields a matched import may write. The student ID is not one of them. */
export function importedStudentPatch(row: ImportSourceRow): {
  first_name: string;
  last_name: string;
  grade_level: number;
  chinese_name?: string;
  guardian_email?: string;
} {
  const patch: {
    first_name: string;
    last_name: string;
    grade_level: number;
    chinese_name?: string;
    guardian_email?: string;
  } = {
    first_name: row.first_name.trim().slice(0, 60),
    last_name: row.last_name.trim().slice(0, 60),
    grade_level: row.grade_level,
  };
  const chinese = row.chinese_name?.trim();
  if (chinese) patch.chinese_name = chinese.slice(0, 120);
  const email = row.guardian_email?.trim().toLowerCase();
  if (email) patch.guardian_email = email.slice(0, 255);
  return patch;
}

export function planStudentNumberCorrection(input: {
  isAdmin: boolean;
  reason: string;
  current: string | null;
  next: string;
  takenByOther: boolean;
  retired: boolean;
}):
  | { ok: true; changed: boolean; retire: string | null; next: string; issuer: "corrected" }
  | { ok: false; message: string } {
  if (!input.isAdmin) {
    return { ok: false, message: "Only an administrator can correct a student ID." };
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return { ok: false, message: "A reason is required to correct a student ID." };
  }
  if (reason.length > 500) return { ok: false, message: "Reason is too long." };
  let next: string | null;
  try {
    next = normalizeStudentNumber(input.next);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Enter the corrected student ID." };
  }
  if (!next) return { ok: false, message: "Enter the corrected student ID." };
  if (isMerakiShaped(next) && !isValidIssuedStudentNumber(next)) {
    return { ok: false, message: "That Meraki student ID check digit is not valid." };
  }
  const current = normalizeStudentNumber(input.current);
  if (current === next) {
    return { ok: true, changed: false, retire: null, next, issuer: "corrected" };
  }
  if (input.takenByOther) {
    return { ok: false, message: "That student ID is already assigned to another student." };
  }
  if (input.retired) {
    return { ok: false, message: "That student ID was retired and cannot be reused." };
  }
  return { ok: true, changed: true, retire: current, next, issuer: "corrected" };
}

export type StudentExit = StudentStatus | "destroy";

/** Withdraw and the other exits keep the row and the ID. Destroy retires the ID. */
export function planStudentExit(kind: StudentExit): {
  keepsRow: boolean;
  retiresNumber: boolean;
  nextStatus: StudentStatus | null;
} {
  if (kind === "destroy") return { keepsRow: false, retiresNumber: true, nextStatus: null };
  return { keepsRow: true, retiresNumber: false, nextStatus: kind };
}

export function authorizeStudentIdAction(
  action: "issue" | "correct" | "status" | "destroy",
  actor: { isAdmin: boolean; canManage: boolean },
): { ok: true } | { ok: false; message: string } {
  if (action === "correct" || action === "destroy") {
    return actor.isAdmin
      ? { ok: true }
      : { ok: false, message: "Only an administrator can do that." };
  }
  if (actor.isAdmin || actor.canManage) return { ok: true };
  return { ok: false, message: "You cannot change this student." };
}

export function studentIdWriteError(message: string): string {
  if (/duplicate key|students_student_number_key|already exists/i.test(message)) {
    return "That student ID is already assigned to another student.";
  }
  return message;
}

export function studentStatusLabel(status: string | null | undefined): string {
  if (status && status in STUDENT_STATUS_LABELS) {
    return STUDENT_STATUS_LABELS[status as StudentStatus];
  }
  return "Active";
}

/** React Query keys the student profile already refreshes after a roster edit. */
export const STUDENT_RECORD_QUERY_KEYS = [["students"], ["roster"], ["class-roster"]] as const;
