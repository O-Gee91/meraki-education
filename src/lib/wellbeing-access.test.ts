import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roles: ["admin"] as string[],
  coClasses: [] as { class_id: string }[],
  coError: null as { message: string } | null,
  name: "Viewer",
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

function query(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  let filtered = rows;
  const builder = {
    select: () => builder,
    eq: (field: string, value: unknown) => {
      filtered = filtered.filter((row) => row[field] === value);
      return builder;
    },
    in: (field: string, values: unknown[]) => {
      filtered = filtered.filter((row) => values.includes(row[field]));
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: filtered[0] ?? null, error }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: filtered, error }).then(resolve),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const rows: Record<string, unknown>[] = table === "students"
        ? [
            { id: "rostered", first_name: "Alex", last_name: "Chen", grade_level: 8, user_id: "student-user", guardian_user_id: "parent-user" },
            { id: "same-grade", first_name: "Sam", last_name: "Lee", grade_level: 7 },
            { id: "unrelated", first_name: "Pat", last_name: "Kim", grade_level: 9 },
          ]
        : table === "classes"
          ? [{ id: "class-1", teacher_id: "primary", teacher_name: "Primary Teacher", grade_level: 7 }]
          : table === "profiles" ? [{ id: "viewer", full_name: mocks.name }]
          : table === "enrollments" ? [{ class_id: "class-1", student_id: "rostered" }]
          : table === "checkins" ? ["rostered", "same-grade", "unrelated"].map((id) => ({ id: `checkin-${id}`, student_id: id, mood: 2, note: null, date: "2026-10-29", created_at: "2026-10-29T00:00:00Z" }))
          : [];
      return query(rows);
    },
  },
}));

import { listWellbeingFeed, type WellbeingFeedItem } from "./wellbeing.functions";

const run = listWellbeingFeed as unknown as (input: unknown) => Promise<WellbeingFeedItem[]>;
const feed = (teacherMode = false, userId = "viewer") => run({
  data: { teacherMode },
  context: {
    userId,
    supabase: {
      from: (table: string) => table === "user_roles"
        ? query(mocks.roles.map((role) => ({ role, user_id: userId })))
        : query(mocks.coClasses.map((row) => ({ ...row, teacher_id: userId })), mocks.coError),
    },
  },
});
const studentIds = async (teacherMode = false, userId = "viewer") => (await feed(teacherMode, userId)).map((row) => row.studentId);

beforeEach(() => {
  mocks.roles = ["admin"];
  mocks.coClasses = [];
  mocks.coError = null;
  mocks.name = "Viewer";
});

describe("wellbeing feed staff access", () => {
  it("lets an admin-only viewer see class check-ins including low moods", async () => {
    expect(await studentIds()).toEqual(["rostered", "same-grade", "unrelated"]);
    expect((await feed()).find((row) => row.studentId === "rostered")?.mood).toBe(2);
  });

  it("keeps a dual-role viewer school-wide in admin mode but scoped in teacher mode", async () => {
    mocks.roles = ["admin", "teacher"];
    mocks.coClasses = [{ class_id: "class-1" }];
    expect(await studentIds(false)).toEqual(["rostered", "same-grade", "unrelated"]);
    expect(await studentIds(true)).toEqual(["rostered"]);
  });

  it("includes a co-teacher's roster even when the student has a different grade", async () => {
    mocks.roles = ["teacher"];
    mocks.coClasses = [{ class_id: "class-1" }];
    expect(await studentIds(true)).toContain("rostered");
  });

  it("does not expose another class's check-ins to an unrelated teacher", async () => {
    mocks.roles = ["teacher"];
    expect(await studentIds(true)).toEqual([]);
  });

  it("retains primary-teacher roster access", async () => {
    mocks.roles = ["teacher"];
    expect(await studentIds(true, "primary")).toEqual(["rostered"]);
  });

  it("matches teacher names without adding unrelated same-grade students", async () => {
    mocks.roles = ["teacher"];
    mocks.name = "  PRIMARY TEACHER  ";
    expect(await studentIds(true)).toEqual(["rostered"]);
  });

  it("keeps students limited to their own check-ins", async () => {
    mocks.roles = ["student"];
    expect(await studentIds(false, "student-user")).toEqual(["rostered"]);
  });

  it("keeps guardians limited to their linked child", async () => {
    mocks.roles = ["parent"];
    expect(await studentIds(false, "parent-user")).toEqual(["rostered"]);
  });

  it("fails closed if co-teacher membership cannot be verified", async () => {
    mocks.roles = ["teacher"];
    mocks.coError = { message: "Membership unavailable" };
    await expect(feed(true)).rejects.toThrow("Could not load co-taught classes: Membership unavailable");
  });
});