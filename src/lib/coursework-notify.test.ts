import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ sent: true }),
  lookup: vi.fn(),
  published: true,
  allowed: true,
  student: { id: "student-1", first_name: "Alex", last_name: "Chen", user_id: "user-1" as string | null, guardian_user_id: "guardian-1" as string | null, guardian_email: "edited-contact@example.com", is_tester: false },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.send }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: mocks.lookup } },
    from: (table: string) => {
      const data = table === "assignments" || table === "assessments"
        ? { id: "work-1", title: "Essay", class_id: "class-1", status: mocks.published ? "published" : "draft", published: mocks.published, due_date: null, due_at: null, description: null, instructions: null }
        : table === "enrollments" ? [{ students: mocks.student }]
        : table === "classes" ? { name: "English" }
        : [{ id: "guardian-1", full_name: "Guardian", email: "edited-profile@example.com" }];
      const query = {
        select: () => query, eq: () => query, in: () => query,
        maybeSingle: async () => ({ data }),
        then: (resolve: (value: { data: unknown }) => unknown) => Promise.resolve({ data }).then(resolve),
      };
      return query;
    },
  },
}));
import { notifyCourseworkPosted } from "./coursework-notify.functions";
const run = notifyCourseworkPosted as unknown as (input: unknown) => Promise<{ students: number; parents: number }>;
const notify = (kind: "assignment" | "assessment" = "assignment", students = true, parents = true) => run({
  data: { kind, ids: ["work-1"], students, parents },
  context: { userId: "teacher-1", supabase: {
    rpc: async () => ({ data: mocks.allowed }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Teacher" } }) }) }) }),
  } },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.published = true;
  Object.assign(mocks.student, { user_id: "user-1", guardian_user_id: "guardian-1", is_tester: false });
  mocks.lookup.mockImplementation(async (id: string) => ({ data: { user: { id, email: id === "user-1" ? "student@example.com" : "guardian@example.com", email_confirmed_at: "2026-11-25T06:00:00Z" } }, error: null }));
});
describe.each(["assignment", "assessment"] as const)("%s email recipients", (kind) => {
  it("uses verified linked account addresses, not editable profiles or contacts", async () => {
    expect(await notify(kind)).toEqual({ students: 1, parents: 1 });
    expect(mocks.send.mock.calls.map((call) => call[1])).toEqual(["student@example.com", "guardian@example.com"]);
  });
  it("never sends to contact-only guardians", async () => {
    mocks.student.guardian_user_id = null;
    expect(await notify(kind, false, true)).toEqual({ students: 0, parents: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send to unverified linked accounts", async () => {
    mocks.lookup.mockImplementation(async (id: string) => ({ data: { user: { id, email: "unverified@example.com", email_confirmed_at: null } }, error: null }));
    expect(await notify(kind)).toEqual({ students: 0, parents: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed on verification lookup failure", async () => {
    mocks.lookup.mockResolvedValue({ data: { user: null }, error: { message: "Unavailable" } });
    expect(await notify(kind)).toEqual({ students: 0, parents: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves draft, class permission and tester exclusions", async () => {
    mocks.published = false;
    expect(await notify(kind)).toEqual({ students: 0, parents: 0 });
    mocks.published = true;
    mocks.allowed = false;
    expect(await notify(kind)).toEqual({ students: 0, parents: 0 });
    mocks.allowed = true;
    mocks.student.is_tester = true;
    expect(await notify(kind)).toEqual({ students: 0, parents: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});