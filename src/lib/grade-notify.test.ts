import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasGradeValue } from "./grading";

const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ sent: true }),
  grade: { id: "grade-1", student_id: "student-1", points_earned: null as number | null, comment: null as string | null, is_draft: false, posted_at: "2026-10-24T06:14:00Z" },
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
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.send }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const data = table === "assignments"
        ? { id: "assignment-1", title: "Essay", class_id: "class-1", points_possible: 20 }
        : table === "classes" ? { name: "English" }
        : table === "grades" ? [mocks.grade]
        : table === "students" ? [{ id: "student-1", first_name: "Alex", last_name: "Chen", user_id: "user-1", guardian_user_id: "guardian-1", guardian_email: null, is_tester: false }]
        : [{ id: "user-1", email: "student@example.com" }, { id: "guardian-1", email: "guardian@example.com" }];
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => ({ data }),
        then: (resolve: (value: { data: unknown }) => unknown) => Promise.resolve({ data }).then(resolve),
      };
      return query;
    },
  },
}));

import { notifyGradesPosted } from "./grade-notify.functions";

// The mock exposes the actual server handler, without making a real email send.
const run = notifyGradesPosted as unknown as (input: unknown) => Promise<{ students: number; parents: number }>;
const notify = () => run({
  data: { assignmentId: "assignment-1", studentIds: ["student-1"] },
  context: { supabase: { rpc: async () => ({ data: true }) } },
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.grade, { points_earned: null, comment: null, is_draft: false });
});

describe("grade notification eligibility", () => {
  it("does not email either family recipient after a score is cleared", async () => {
    expect(hasGradeValue(null, null)).toBe(false);
    expect(await notify()).toEqual({ students: 0, parents: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not treat preserved feedback as a posted score", async () => {
    mocks.grade.comment = "Please revise your introduction.";
    expect(hasGradeValue(null, mocks.grade.comment)).toBe(false);
    await notify();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("still notifies the student and guardian for a zero score", async () => {
    mocks.grade.points_earned = 0;
    expect(hasGradeValue(0, null)).toBe(true);
    expect(await notify()).toEqual({ students: 1, parents: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledWith("grade-posted", "student@example.com", expect.objectContaining({ templateData: expect.objectContaining({ scoreText: "0 / 20" }) }));
  });

  it("still notifies for a recorded special mark", async () => {
    mocks.grade.comment = "MARK:EX";
    expect(hasGradeValue(null, "MARK:EX")).toBe(true);
    expect(await notify()).toEqual({ students: 1, parents: 1 });
    expect(mocks.send).toHaveBeenCalledWith("grade-posted", "guardian@example.com", expect.objectContaining({ templateData: expect.objectContaining({ scoreText: "EX" }) }));
  });

  it("never emails a draft score", async () => {
    mocks.grade.points_earned = 18;
    mocks.grade.is_draft = true;
    await notify();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("still emails a genuine posted score correction", async () => {
    mocks.grade.points_earned = 19;
    expect(await notify()).toEqual({ students: 1, parents: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});