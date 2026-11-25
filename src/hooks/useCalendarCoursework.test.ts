import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { CourseworkItem } from "@/lib/calendar-coursework";

const mock = vi.hoisted(() => ({
  ids: ["s1"],
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  read: null as null | (() => Promise<CourseworkItem[]>),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, isStaff: false, previewingStudent: false }) }));
vi.mock("@/hooks/useSelfStudents", () => ({ useSelfStudents: () => ({ ids: mock.ids }) }));
vi.mock("@/hooks/useTeacherScope", () => ({ useTeacherScope: () => ({ classIds: null }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useQuery: (options: { queryFn: () => Promise<CourseworkItem[]> }) => { mock.read = options.queryFn; return {}; },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let rows = [...(mock.tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return q; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return q; },
      is: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return q; },
      gte: () => q, lte: () => q, or: () => q, order: () => q,
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    };
    return q;
  },
} }));
import { useCalendarCoursework } from "./useCalendarCoursework";
function Harness() { useCalendarCoursework("2026-11-01", "2026-11-30"); return null; }
async function read() {
  renderToString(createElement(Harness));
  if (!mock.read) throw new Error("Calendar query not registered");
  return mock.read();
}
const disc = { id: "d1", title: "Discussion", class_id: "c1", due_date: "2026-11-25", due_at: null, thread_id: null, required_replies: 2, assignment_id: null };
const post = (id: string, parent: string | null) => ({ id, discussion_id: "d1", author_id: "u1", parent_id: parent, deleted_at: null });
beforeEach(() => {
  mock.ids = ["s1"];
  mock.read = null;
  mock.tables = {
    enrollments: [{ class_id: "c1", student_id: "s1" }],
    classes: [{ id: "c1", name: "English", timezone: "Asia/Shanghai" }],
    students: [{ id: "s1", user_id: "u1" }],
    discussions: [disc],
    discussion_posts: [post("p1", null), post("p2", "other-root")],
  };
});
describe("calendar uses shared completion rules", () => {
  it("does not complete an ungraded discussion with one main post but only 1 of 2 required replies", async () => {
    expect((await read()).find((r) => r.id === "d1")?.completed).toBe(false);
  });
  it("completes an ungraded discussion with a main post and 2 required replies", async () => {
    mock.tables['discussion_posts']?.push(post("p3", "another-root"));
    expect((await read()).find((r) => r.id === "d1")?.completed).toBe(true);
  });
  it("does not count a deleted reply towards completion", async () => {
    mock.tables['discussion_posts']?.push({ ...post("p3", "another-root"), deleted_at: "2026-11-25" });
    expect((await read()).find((r) => r.id === "d1")?.completed).toBe(false);
  });
  it("keeps each shared class discussion's own reply requirement", async () => {
    mock.tables['discussions'] = [{ ...disc, id: "d-shared", thread_id: "d1", required_replies: 1 }];
    expect((await read()).find((r) => r.id === "d-shared")?.completed).toBe(true);
  });
  it("does not complete a returned assignment explicitly marked Missing", async () => {
    mock.tables['assignments'] = [{ id: "a1", title: "Essay", class_id: "c1", due_date: "2026-11-25", status: "published" }];
    mock.tables['assignment_submissions'] = [{ assignment_id: "a1", student_id: "s1", status: "returned" }];
    mock.tables['grades'] = [{ assignment_id: "a1", student_id: "s1", is_draft: false, points_earned: null, comment: "MARK:M" }];
    expect((await read()).find((r) => r.id === "a1")?.completed).toBe(false);
  });
  it("never uses a draft grade to mark an assignment completed", async () => {
    mock.tables['assignments'] = [{ id: "a1", title: "Essay", class_id: "c1", due_date: "2026-11-25", status: "published" }];
    mock.tables['grades'] = [{ assignment_id: "a1", student_id: "s1", is_draft: true, points_earned: 95, comment: null }];
    expect((await read()).find((r) => r.id === "a1")?.completed).toBe(false);
  });
  it("does not mark an assessment draft as completed", async () => {
    mock.tables['assessments'] = [{ id: "test1", title: "Quiz", class_id: "c1", due_at: "2026-11-25T08:00:00Z", published: true, assignment_id: null }];
    mock.tables['assessment_submissions'] = [{ assessment_id: "test1", student_id: "s1", status: "draft" }];
    expect((await read()).find((r) => r.id === "test1")?.completed).toBe(false);
  });
  it("keeps a family item incomplete if another enrolled child has not completed it", async () => {
    mock.ids = ["s1", "s2"];
    mock.tables['enrollments']?.push({ class_id: "c1", student_id: "s2" });
    mock.tables['discussion_posts']?.push(post("p3", "another-root"));
    expect((await read()).find((r) => r.id === "d1")?.completed).toBe(false);
  });
  it("does not let a child in a different class block completed work", async () => {
    mock.ids = ["s1", "s2"];
    mock.tables['enrollments']?.push({ class_id: "c2", student_id: "s2" });
    mock.tables['discussion_posts']?.push(post("p3", "another-root"));
    expect((await read()).find((r) => r.id === "d1")?.completed).toBe(true);
  });
  it("loads assignments beyond the 1000-row response limit", async () => {
    mock.tables['assignments'] = Array.from({ length: 1001 }, (_, i) => ({ id: `a${i}`, title: "Essay", class_id: "c1", due_date: "2026-11-25", status: "published" }));
    expect((await read()).filter((r) => r.kind === "assignment")).toHaveLength(1001);
  });
});
