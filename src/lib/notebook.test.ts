import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATUSES,
  attendanceDayKey,
  attendanceHistoryKey,
  attendanceRosterKey,
  countRecordedAttendance,
  loadAttendanceRows,
  OWN_ATTENDANCE_HISTORY_LIMIT,
  writeInBatches,
} from "./notebook-attendance";
import {
  attendanceReadKind,
  classAttendanceNotebookVisible,
  DEFAULT_STYLE,
  notebookDocumentClass,
  notebookSelected,
  NOTEBOOK_SURFACES,
  resolveNotebookStyle,
  surfacesForStyle,
} from "./notebook-style";
import { resolveTeacherScopeView } from "@/hooks/useTeacherScope";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");

const scope = (classIds: string[], studentIds: string[] = []) => ({
  classIds: new Set(classIds),
  studentIds: new Set(studentIds),
  gradeLevels: new Set<number>(),
});

describe("notebook selection", () => {
  it("stays off unless the stored value is exactly notebook", () => {
    expect(DEFAULT_STYLE).toBe("normal");
    expect(resolveNotebookStyle(null)).toBe("normal");
    expect(resolveNotebookStyle(undefined)).toBe("normal");
    expect(resolveNotebookStyle("")).toBe("normal");
    expect(resolveNotebookStyle("Notebook")).toBe("normal");
    expect(resolveNotebookStyle("notebook ")).toBe("normal");
    expect(resolveNotebookStyle("notebook")).toBe("notebook");
    expect(notebookSelected("normal")).toBe(false);
    expect(notebookDocumentClass("normal")).toBe("");
    expect(notebookDocumentClass("notebook")).toBe("style-notebook");
  });

  it("features the same surfaces for every role, and none when standard is selected", () => {
    expect(surfacesForStyle("normal")).toEqual([]);
    const selected = surfacesForStyle("notebook");
    expect(selected).toEqual(NOTEBOOK_SURFACES);
    for (const surface of [
      "navigation",
      "page-title",
      "dashboard",
      "classes",
      "class",
      "assignments",
      "assessment",
      "wellbeing",
      "behavior",
      "messages",
      "community",
      "files",
      "students",
      "people",
      "moderation",
      "settings",
      "attendance",
    ]) {
      expect(selected).toContain(surface);
    }
    expect(new Set(selected).size).toBe(selected.length);
  });

  it("applies the stored choice before paint and styles the whole document when selected", () => {
    expect(root).toContain("meraki-style");
    expect(root).toContain("style-notebook");
    expect(root).toContain("s==='notebook'");
    expect(css).toContain(".style-notebook .notebook-heading");
    expect(css).not.toContain(".style-notebook :is(h1, h2, h3, h4, .notebook-heading)");
    expect(css).toContain(".notebook-data");
    expect(css).toContain("font-family: var(--font-sans)");
    expect(css).toContain(".style-notebook :is(.panel, .notebook-card)");
    expect(css).toContain(".style-notebook :is(thead, .divide-y > :not(:last-child))");
    expect(css).toContain('.style-notebook .notebook-nav a[aria-current="page"]');
    expect(css).toContain("text-decoration-line: underline");
  });
});

describe("notebook attendance access", () => {
  it("shows class tallies only to a staff view with notebook selected", () => {
    expect(classAttendanceNotebookVisible("notebook", true)).toBe(true);
    expect(classAttendanceNotebookVisible("notebook", false)).toBe(false);
    expect(classAttendanceNotebookVisible("normal", true)).toBe(false);
    expect(classAttendanceNotebookVisible("normal", false)).toBe(false);
  });

  it("keeps students, guardians, and student preview off the class-wide read", () => {
    expect(attendanceReadKind(true)).toBe("class-day");
    expect(attendanceReadKind(false)).toBe("own-history");
    expect(OWN_ATTENDANCE_HISTORY_LIMIT).toBe(50);
  });

  it("keys roster, day, and history reads by the actual filter", () => {
    expect(attendanceRosterKey("class-a")).not.toEqual(attendanceRosterKey("class-b"));
    expect(attendanceDayKey("class-a", "2026-11-26")).not.toEqual(attendanceDayKey("class-a", "2026-11-27"));
    expect(attendanceHistoryKey("class-a")).not.toEqual(attendanceHistoryKey("class-b"));
    expect(attendanceDayKey("class-a", "2026-11-26")).toEqual(["attendance", "class-a", "2026-11-26"]);
  });
});

describe("notebook attendance reads and writes", () => {
  it("counts recorded roster statuses and does not invent attendance", () => {
    const counts = countRecordedAttendance(
      ["a", "a", "b", "c", "d"],
      [
        { student_id: "a", status: "absent" },
        { student_id: "a", status: "present" },
        { student_id: "c", status: "tardy" },
        { student_id: "z", status: "present" },
        { student_id: "d", status: "left" },
      ],
    );
    expect(counts).toEqual([
      { label: "present", count: 0 },
      { label: "absent", count: 1 },
      { label: "tardy", count: 1 },
      { label: "excused", count: 0 },
    ]);
    expect(ATTENDANCE_STATUSES).toEqual(["present", "absent", "tardy", "excused"]);
    expect(countRecordedAttendance([], [{ student_id: "a", status: "present" }]).every((row) => row.count === 0)).toBe(true);
  });

  it("pages past the 1000-row cap and throws instead of returning an empty success", async () => {
    const source = Array.from({ length: 1001 }, (_, i) => ({ id: String(i) }));
    let pages = 0;
    const rows = await loadAttendanceRows((from, to) => {
      pages += 1;
      return Promise.resolve({ data: source.slice(from, to + 1), error: null });
    });
    expect(pages).toBe(2);
    expect(rows).toHaveLength(1001);
    await expect(loadAttendanceRows(() => Promise.resolve({ data: null, error: { message: "attendance denied" } }))).rejects.toThrow(
      "attendance denied",
    );
  });

  it("chunks writes, skips an empty clear, and stops on the first error", async () => {
    const writes: number[][] = [];
    const writer = async (batch: number[]) => {
      writes.push(batch);
      return { error: null };
    };
    await writeInBatches([], writer);
    expect(writes).toEqual([]);
    await writeInBatches([1, 2, 3, 4, 5], writer, 2);
    expect(writes).toEqual([[1, 2], [3, 4], [5]]);

    let calls = 0;
    await expect(
      writeInBatches([1, 2, 3], async () => {
        calls += 1;
        return calls === 2 ? { error: { message: "clear denied" } } : { error: null };
      }, 1),
    ).rejects.toThrow("clear denied");
    expect(calls).toBe(2);
  });
});

describe("class scope used by notebook surfaces", () => {
  it("fails closed when the teacher or preview scope read errors", () => {
    const failed = resolveTeacherScopeView({
      teacherMode: true,
      previewingStudent: false,
      teacherData: undefined,
      teacherError: true,
      previewData: undefined,
      previewError: false,
    });
    expect(failed.scopeError).toBe(true);
    expect(failed.classIds?.size).toBe(0);
    expect(failed.studentIds?.size).toBe(0);
    expect(failed.classIds).not.toBeNull();

    const previewFailed = resolveTeacherScopeView({
      teacherMode: true,
      previewingStudent: true,
      teacherData: scope(["school"]),
      teacherError: false,
      previewData: undefined,
      previewError: true,
    });
    expect(previewFailed.scopeError).toBe(true);
    expect(previewFailed.teacherMode).toBe(false);
    expect([...previewFailed.classIds!]).toEqual([]);
  });

  it("keeps a resolved teacher scope and leaves admin mode unfiltered", () => {
    const teacher = resolveTeacherScopeView({
      teacherMode: true,
      previewingStudent: false,
      teacherData: scope(["c1"], ["s1"]),
      teacherError: false,
      previewData: undefined,
      previewError: false,
    });
    expect(teacher.scopeError).toBe(false);
    expect(teacher.scoped).toBe(true);
    expect([...teacher.classIds!]).toEqual(["c1"]);

    const loading = resolveTeacherScopeView({
      teacherMode: true,
      previewingStudent: false,
      teacherData: undefined,
      teacherError: false,
      previewData: undefined,
      previewError: false,
    });
    expect(loading.classIds).toBeNull();
    expect(loading.scopeError).toBe(false);

    const admin = resolveTeacherScopeView({
      teacherMode: false,
      previewingStudent: false,
      teacherData: undefined,
      teacherError: false,
      previewData: undefined,
      previewError: false,
    });
    expect(admin.classIds).toBeNull();
    expect(admin.scopeError).toBe(false);
  });

  it("does not use the school-wide teacher rows while previewing a student", () => {
    const preview = resolveTeacherScopeView({
      teacherMode: true,
      previewingStudent: true,
      teacherData: scope(["school"], ["everyone"]),
      teacherError: false,
      previewData: scope(["tester-class"], ["tester"]),
      previewError: false,
    });
    expect([...preview.classIds!]).toEqual(["tester-class"]);
    expect([...preview.studentIds!]).toEqual(["tester"]);
    expect(preview.teacherMode).toBe(false);
  });
});
