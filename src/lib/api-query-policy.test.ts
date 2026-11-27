import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { directoryQueryKey, feedbackKey, READ_REUSE_MS, wellbeingFeedKey } from "./api-query-policy";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("scoped read reuse", () => {
  it("reuses a wellbeing read for badge, page and snapshot until explicitly invalidated", async () => {
    const client = new QueryClient();
    const read = vi.fn(async () => [{ id: "checkin" }]);
    const options = { queryKey: wellbeingFeedKey("u1", "teacher", true), queryFn: read, staleTime: READ_REUSE_MS };
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    await client.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ["checkins"] });
    await client.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(2);
    client.clear();
  });
  it("keeps wellbeing identities, staff hats and date filters separate", () => {
    const keys = [wellbeingFeedKey("u1", "teacher", true), wellbeingFeedKey("u2", "teacher", true), wellbeingFeedKey("u1", "admin", false), wellbeingFeedKey("u1", "teacher", true, "2026-11-25")];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
  });
  it("never reuses family feedback across accounts or student-preview contexts", () => {
    const keys = [feedbackKey("u1", "student", false), feedbackKey("u2", "student", false), feedbackKey("u1", "parent", false), feedbackKey("u1", "student", true, "s1"), feedbackKey("u1", "student", true, "s2")];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(5);
  });

  it("splits students and classes caches by viewer and column list", () => {
    const viewer = { userId: "u1", role: "teacher", preview: false };
    const keys = [
      directoryQueryKey("students", "id, first_name, last_name", viewer),
      directoryQueryKey("students", "id, first_name, last_name, grade_level", viewer),
      directoryQueryKey("students", "id, first_name, last_name", { ...viewer, userId: "u2" }),
      directoryQueryKey("students", "id, first_name, last_name", { ...viewer, role: "admin" }),
      directoryQueryKey("students", "id, first_name, last_name", { ...viewer, preview: true }),
      directoryQueryKey("classes", "id, name", viewer),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
  });
});

describe("directory read contract", () => {
  it("does not cache students or classes under a bare query key", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (!/queryKey:\s*\[\s*["'](students|classes)["']\s*\]/.test(line)) return;
        if (line.includes("invalidateQueries")) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("chunks the behavior enrollment read and pages the MCP lists", () => {
    const behavior = readFileSync("src/routes/_authenticated/behavior.tsx", "utf8");
    expect(behavior).toContain("fetchByIds");
    expect(behavior).not.toMatch(/\.in\("class_id", ids\)/);
    const reports = readFileSync("src/routes/_authenticated/reports.tsx", "utf8");
    const wellbeing = readFileSync("src/routes/_authenticated/wellbeing.tsx", "utf8");
    const roster = readFileSync("src/routes/_authenticated/classes.$classId.tsx", "utf8");
    expect(reports).not.toMatch(/reportStudentColumns = "[^"]*student_number/);
    expect(reports).not.toMatch(/reportStudentColumns = "[^"]*guardian_email/);
    expect(wellbeing).not.toMatch(/assistedStudentColumns = "[^"]*student_number/);
    expect(wellbeing).not.toMatch(/assistedStudentColumns = "[^"]*guardian_email/);
    expect(roster).not.toMatch(/rosterPickerColumns = "[^"]*guardian_email/);
    for (const file of [
      "src/lib/mcp/tools/list-classes.ts",
      "src/lib/mcp/tools/list-assignments.ts",
      "src/lib/mcp/tools/list-announcements.ts",
      "src/lib/mcp/tools/list-calendar-events.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("fetchAll");
      expect(source).toContain('.order("id"');
    }
  });
});