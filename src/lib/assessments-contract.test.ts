import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string } | null;

const { state, query } = vi.hoisted(() => {
  const state = {
    staff: true as boolean | null,
    staffError: null as DbError,
    manages: true,
    scopeError: null as DbError,
    readError: null as DbError,
    writeError: null as DbError,
    answerError: null as DbError,
    tables: {} as Record<string, Row[]>,
    writes: [] as { table: string; rows: unknown; options?: unknown }[],
    deletes: [] as { table: string; filters: Record<string, unknown> }[],
  };

  function matching(table: string, filters: Record<string, unknown>) {
    return (state.tables[table] ?? []).filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value),
    );
  }

  function query(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "write" = "select";
    let payload: unknown = null;
    let options: unknown;
    const finish = () => {
      if (mode === "write") {
        state.writes.push({ table, rows: payload, options });
        return { data: null, error: state.writeError };
      }
      if (state.readError) return { data: null, error: state.readError };
      return { data: matching(table, filters), error: null };
    };
    const api = {
      select() {
        return api;
      },
      eq(key: string, value: unknown) {
        filters[key] = value;
        return api;
      },
      gte() {
        return api;
      },
      upsert(rows: unknown, opts?: unknown) {
        mode = "write";
        payload = rows;
        options = opts;
        return api;
      },
      insert(rows: unknown) {
        const run = async () => {
          state.writes.push({ table, rows, options: undefined });
          const error = table === "assessment_answers" ? state.answerError : state.writeError;
          if (error) return { data: null, error };
          return { data: { id: "submission-1" }, error: null };
        };
        return {
          select() {
            return { single: run };
          },
          then(resolve: (value: { data: unknown; error: DbError }) => unknown, reject?: (reason: unknown) => unknown) {
            return run().then(resolve, reject);
          },
        };
      },
      delete() {
        const filters: Record<string, unknown> = {};
        const api = {
          eq(key: string, value: unknown) {
            filters[key] = value;
            return api;
          },
          then(resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
            state.deletes.push({ table, filters: { ...filters } });
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return api;
      },
      maybeSingle: async () => {
        const result = finish();
        const rows = Array.isArray(result.data) ? result.data : [];
        return { data: rows[0] ?? null, error: result.error };
      },
      limit: async () => finish(),
      then(resolve: (value: { data: unknown; error: DbError }) => unknown) {
        return Promise.resolve(finish()).then(resolve);
      },
    };
    return api;
  }

  return { state, query };
});

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
vi.mock("@/lib/grading.server", () => ({ autoGrade: () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => query(table) },
}));

import { applyMissedAssessmentZeros, submitAssessment } from "./assessments.functions";

const zeros = applyMissedAssessmentZeros as unknown as (input: {
  data: { classId: string };
  context: {
    supabase: { rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: DbError }> };
  };
}) => Promise<{ zeroed: number; synced: number }>;

const submit = submitAssessment as unknown as (input: {
  data: { assessmentId: string; answers: { questionId: string; response: { text?: string } }[] };
  context: {
    userId: string;
    supabase: { from: (table: string) => ReturnType<typeof query> };
  };
}) => Promise<unknown>;

const classId = "00000000-0000-4000-8000-000000000010";
const assessmentId = "00000000-0000-4000-8000-000000000020";

function context() {
  return {
    supabase: {
      from: query,
      rpc: async (name: string) => {
        if (name === "is_staff") return { data: state.staff, error: state.staffError };
        if (name === "can_manage_class") return { data: state.manages, error: state.scopeError };
        return { data: null, error: null };
      },
    },
  };
}

beforeEach(() => {
  state.staff = true;
  state.staffError = null;
  state.manages = true;
  state.scopeError = null;
  state.readError = null;
  state.writeError = null;
  state.answerError = null;
  state.tables = {};
  state.writes = [];
  state.deletes = [];
});

describe("applyMissedAssessmentZeros", () => {
  it("throws forbidden instead of reporting that nothing was scored", async () => {
    state.staff = false;
    await expect(zeros({ data: { classId }, context: context() })).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringMatching(/teachers and admins/),
    });
    state.staff = true;
    state.manages = false;
    await expect(zeros({ data: { classId }, context: context() })).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringMatching(/class you manage/),
    });
    expect(state.writes).toEqual([]);
  });

  it("throws when a read fails", async () => {
    state.readError = { message: "grades unavailable", code: "57014" };
    await expect(zeros({ data: { classId }, context: context() })).rejects.toMatchObject({
      code: "failed",
      message: "grades unavailable",
    });
    expect(state.writes).toEqual([]);
  });

  it("upserts a zero and leaves an already saved grade alone", async () => {
    state.tables["assessments"] = [
      {
        id: "assess-1",
        class_id: classId,
        assignment_id: "assign-1",
        published: true,
        due_at: "2000-01-01T00:00:00.000Z",
        closes_at: "2000-01-01T00:00:00.000Z",
      },
    ];
    state.tables["enrollments"] = [
      { student_id: "student-1", class_id: classId },
      { student_id: "student-2", class_id: classId },
    ];
    state.tables["grades"] = [
      {
        student_id: "student-2",
        assignment_id: "assign-1",
        points_earned: 9,
        comment: "Excellent essay",
      },
    ];
    state.tables["assessment_submissions"] = [];
    state.tables["grade_reset_log"] = [];

    await expect(zeros({ data: { classId }, context: context() })).resolves.toEqual({
      zeroed: 1,
      synced: 0,
    });
    expect(state.writes).toEqual([
      {
        table: "grades",
        rows: [
          expect.objectContaining({
            assignment_id: "assign-1",
            student_id: "student-1",
            points_earned: 0,
            comment: "Not completed — automatic zero",
          }),
        ],
        options: { onConflict: "assignment_id,student_id", ignoreDuplicates: true },
      },
    ]);
  });

  it("throws when the zero write fails so the caller can retry", async () => {
    state.tables["assessments"] = [
      {
        id: "assess-1",
        class_id: classId,
        assignment_id: "assign-1",
        published: true,
        due_at: "2000-01-01T00:00:00.000Z",
        closes_at: null,
      },
    ];
    state.tables["enrollments"] = [{ student_id: "student-1", class_id: classId }];
    state.writeError = { message: "could not save", code: "23505" };
    await expect(zeros({ data: { classId }, context: context() })).rejects.toMatchObject({
      code: "conflict",
      message: "could not save",
    });
  });

  it("maps a bad class id to validation", async () => {
    await expect(zeros({ data: { classId: "class" }, context: context() })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("submitAssessment", () => {
  it("maps the unique submission violation to the already-submitted message", async () => {
    state.tables["students"] = [{ id: "student-1", user_id: "user-1" }];
    state.tables["assessments"] = [
      {
        id: assessmentId,
        class_id: classId,
        assignment_id: null,
        published: true,
        available_from: null,
        closes_at: null,
      },
    ];
    state.tables["enrollments"] = [{ id: "enr-1", class_id: classId, student_id: "student-1" }];
    state.writeError = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "assessment_submissions_assessment_id_student_id_key"',
    };
    const error = await submit({
      data: { assessmentId, answers: [] },
      context: { userId: "user-1", supabase: { from: query } },
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: "conflict",
      message: "You have already submitted this assessment",
    });
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: "conflict",
      message: "You have already submitted this assessment",
    });
  });

  it("maps invalid assessment input to validation", async () => {
    await expect(
      submit({
        data: { assessmentId: "nope", answers: [] },
        context: { userId: "user-1", supabase: { from: query } },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(state.writes).toEqual([]);
  });

  function openAttempt(dueAt: string | null) {
    state.tables["students"] = [{ id: "student-1", user_id: "user-1" }];
    state.tables["assessments"] = [
      {
        id: assessmentId,
        class_id: classId,
        assignment_id: "assign-1",
        published: true,
        available_from: null,
        closes_at: null,
        due_at: dueAt,
      },
    ];
    state.tables["classes"] = [{ id: classId, timezone: "Asia/Shanghai" }];
    state.tables["enrollments"] = [{ id: "enr-1", class_id: classId, student_id: "student-1" }];
    state.tables["assessment_submissions"] = [];
  }

  it("keeps a quiz with no questions in review and does not post a zero", async () => {
    openAttempt(null);
    state.tables["assessment_questions"] = [];
    await expect(
      submit({
        data: { assessmentId, answers: [] },
        context: { userId: "user-1", supabase: { from: query } },
      }),
    ).resolves.toMatchObject({ needsReview: true, autoScore: 0, isLate: false });
    expect(state.writes.map((write) => write.table)).toEqual(["assessment_submissions"]);
    expect(state.writes[0]?.rows).toMatchObject({ status: "needs_review", auto_score: 0 });
    expect(state.writes.some((write) => write.table === "grades")).toBe(false);
  });

  it("marks an attempt late when only due_at is in the past", async () => {
    openAttempt("2020-01-01T15:59:00.000Z");
    state.tables["assessment_questions"] = [
      { id: "q-1", assessment_id: assessmentId, kind: "short_answer", points: 5, answer_key: {} },
    ];
    await expect(
      submit({
        data: { assessmentId, answers: [{ questionId: "00000000-0000-4000-8000-000000000099", response: { text: "answer" } }] },
        context: { userId: "user-1", supabase: { from: query } },
      }),
    ).resolves.toMatchObject({ isLate: true, needsReview: true });
    expect(state.writes.find((write) => write.table === "assessment_submissions")?.rows).toMatchObject({
      is_late: true,
    });
    expect(state.writes.some((write) => write.table === "grades")).toBe(false);
  });

  it("deletes the submission when saving answers fails", async () => {
    openAttempt("2099-01-01T15:59:00.000Z");
    state.tables["assessment_questions"] = [
      { id: "q-1", assessment_id: assessmentId, kind: "short_answer", points: 5, answer_key: {} },
    ];
    state.answerError = { message: "answers failed", code: "23503" };
    await expect(
      submit({
        data: { assessmentId, answers: [{ questionId: "00000000-0000-4000-8000-000000000099", response: { text: "answer" } }] },
        context: { userId: "user-1", supabase: { from: query } },
      }),
    ).rejects.toMatchObject({ message: "answers failed" });
    expect(state.deletes).toEqual([{ table: "assessment_submissions", filters: { id: "submission-1" } }]);
    expect(state.writes.some((write) => write.table === "grades")).toBe(false);
  });
});
