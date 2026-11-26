import { chunk, fetchAll } from "./query";

/**
 * Attendance rows that feed notebook tallies and the student's own history.
 * Reads and writes go through the signed-in browser client, so row-level
 * security still decides access. These helpers only page, chunk, and refuse
 * to treat a failed read as zero.
 */

export const ATTENDANCE_STATUSES = ["present", "absent", "tardy", "excused"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceCount = { label: AttendanceStatus; count: number };

/**
 * Recent window for the signed-in student or linked children. It is not a
 * silent cap on a class-wide count. Class-day reads page with fetchAll instead.
 */
export const OWN_ATTENDANCE_HISTORY_LIMIT = 50;

type RangeResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

type WriteResult = { error: { message: string } | null };

function isStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/**
 * Counts recorded statuses for roster students only.
 * A student with no row is not present. A row for someone off the roster is
 * ignored. A repeated student keeps the first status and is not counted twice.
 */
export function countRecordedAttendance(
  rosterStudentIds: readonly string[],
  records: readonly { student_id: string; status: string }[],
): AttendanceCount[] {
  const statusByStudent = new Map<string, string>();
  for (const record of records) {
    if (!record.student_id || statusByStudent.has(record.student_id)) continue;
    statusByStudent.set(record.student_id, record.status);
  }
  const counts = new Map<AttendanceStatus, number>(ATTENDANCE_STATUSES.map((status) => [status, 0]));
  const seen = new Set<string>();
  for (const studentId of rosterStudentIds) {
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);
    const status = statusByStudent.get(studentId);
    if (!status || !isStatus(status)) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return ATTENDANCE_STATUSES.map((label) => ({ label, count: counts.get(label) ?? 0 }));
}

/** Pages one attendance read. Throws on error so the screen can show a failure. */
export async function loadAttendanceRows<T>(read: (from: number, to: number) => RangeResult<T>): Promise<T[]> {
  return fetchAll(read);
}

export function attendanceRosterKey(classId: string) {
  return ["attendance-roster", classId] as const;
}

export function attendanceDayKey(classId: string, date: string) {
  return ["attendance", classId, date] as const;
}

export function attendanceHistoryKey(classId: string) {
  return ["my-attendance-history", classId] as const;
}

/**
 * Sends a write in short batches. An empty list does not call the writer.
 * The first error stops the rest and is thrown, so a failed clear is not success.
 */
export async function writeInBatches<T>(
  rows: readonly T[],
  write: (batch: T[]) => Promise<WriteResult>,
  size = 150,
): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk([...rows], size)) {
    const { error } = await write(batch);
    if (error) throw new Error(error.message);
  }
}
