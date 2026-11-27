import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeStudentIdAction,
  formatIssuedStudentNumber,
  importedStudentPatch,
  isValidIssuedStudentNumber,
  luhnCheckDigit,
  luhnValid,
  nextIssuedStudentNumber,
  normalizeStudentNumber,
  planDuplicateBackfill,
  planIssuance,
  planStudentExit,
  planStudentImport,
  planStudentNumberCorrection,
  studentIdWriteError,
  tryNormalizeStudentNumber,
} from "./student-ids";

const drizzle = readFileSync("drizzle/migrations/0044_student_number_issuance.sql", "utf8");
const supabase = readFileSync("supabase/migrations/20261127120000_student_number_issuance.sql", "utf8");

describe("Luhn format", () => {
  it("issues MK plus 6 digits plus an ISO check digit", () => {
    expect(luhnCheckDigit("000042")).toBe("2");
    expect(formatIssuedStudentNumber(42)).toBe("MK0000422");
    expect(isValidIssuedStudentNumber("MK0000422")).toBe(true);
    expect(luhnValid("0000422")).toBe(true);
  });

  it("does not treat the sample shape MK0000420 as an issued ID", () => {
    expect(isValidIssuedStudentNumber("MK0000420")).toBe(false);
    expect(luhnValid("0000420")).toBe(false);
  });

  it("builds the ID only from the sequence body", () => {
    expect(formatIssuedStudentNumber(1)).toBe(`MK000001${luhnCheckDigit("000001")}`);
    expect(formatIssuedStudentNumber(1)).not.toMatch(/name|birth|email|ssn|user/i);
  });

  it("rejects a non-digit body and an exhausted sequence", () => {
    expect(() => luhnCheckDigit("12a")).toThrow(/digits/);
    expect(() => formatIssuedStudentNumber(0)).toThrow(/exhausted/);
    expect(() => formatIssuedStudentNumber(1_000_000)).toThrow(/exhausted/);
  });
});

describe("normalize", () => {
  it("trims, drops whitespace, and uppercases", () => {
    expect(normalizeStudentNumber("  mk 0000422 ")).toBe("MK0000422");
    expect(normalizeStudentNumber("  ")).toBeNull();
    expect(normalizeStudentNumber(null)).toBeNull();
  });

  it("rejects a value longer than 40 characters and lets search ignore it", () => {
    expect(() => normalizeStudentNumber("A".repeat(41))).toThrow(/40 characters/);
    expect(tryNormalizeStudentNumber("A".repeat(41))).toBeNull();
  });
});

describe("issuance", () => {
  it("is idempotent when the student already has a number", () => {
    const taken = new Set<string>();
    const first = planIssuance({ student_number: null }, 1, taken);
    taken.add(first.studentNumber);
    const again = planIssuance({ student_number: first.studentNumber }, first.nextBody, taken);
    expect(again).toEqual({ studentNumber: first.studentNumber, nextBody: first.nextBody, issued: false });
    expect(planIssuance({ student_number: "stu-9" }, 4, taken)).toEqual({
      studentNumber: "STU-9",
      nextBody: 4,
      issued: false,
    });
  });

  it("skips numbers already on a student or already retired", () => {
    const blocked = formatIssuedStudentNumber(1);
    const retired = formatIssuedStudentNumber(2);
    const next = nextIssuedStudentNumber(1, new Set([blocked, retired]));
    expect(next.number).toBe(formatIssuedStudentNumber(3));
    expect(next.nextBody).toBe(4);
    expect(new Set([blocked, retired, next.number]).size).toBe(3);
  });
});

describe("duplicate backfill", () => {
  it("keeps the shared number on the earliest created_at row and reissues the rest", () => {
    const plan = planDuplicateBackfill([
      { id: "b", created_at: "2024-02-01T00:00:00Z", student_number: "MK0000420" },
      { id: "a", created_at: "2024-01-01T00:00:00Z", student_number: " mk0000420 " },
      { id: "c", created_at: "2024-01-01T00:00:00Z", student_number: "LEGACY" },
      { id: "d", created_at: "2024-03-01T00:00:00Z", student_number: "   " },
      { id: "e", created_at: "2024-01-01T00:00:00Z", student_number: "LEGACY" },
    ]);
    expect(plan.keep).toEqual([
      { id: "a", student_number: "MK0000420", issuer: "imported" },
      { id: "c", student_number: "LEGACY", issuer: "imported" },
    ]);
    expect(plan.reissue).toEqual([
      { id: "b", old_number: "MK0000420" },
      { id: "e", old_number: "LEGACY" },
    ]);
  });

  it("breaks a created_at tie by id", () => {
    const plan = planDuplicateBackfill([
      { id: "b", created_at: "2024-01-01", student_number: "SAME" },
      { id: "a", created_at: "2024-01-01", student_number: "same" },
    ]);
    expect(plan.keep.map((row) => row.id)).toEqual(["a"]);
    expect(plan.reissue.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("import match", () => {
  const row = (student_number: string | null, first = "Ada", last = "Lovelace") => ({
    first_name: first,
    last_name: last,
    grade_level: 7,
    student_number,
    chinese_name: null,
    guardian_email: null,
  });

  it("matches a returning student on student ID and does not overwrite that ID", () => {
    const plan = planStudentImport(
      [row("mk0000422", "Different", "Name")],
      new Map([["MK0000422", { in_use: true, retired: false, managed_id: "student-1" }]]),
    );
    expect(plan).toEqual([
      {
        action: "match",
        studentId: "student-1",
        studentNumber: "MK0000422",
        overwriteNumber: false,
        row: row("mk0000422", "Different", "Name"),
      },
    ]);
    expect(importedStudentPatch(row("MK0000422"))).not.toHaveProperty("student_number");
  });

  it("does not match on name alone and inserts a new row when the ID is blank", () => {
    const plan = planStudentImport(
      [row(null, "Ada", "Lovelace"), row("", "Ada", "Lovelace")],
      new Map([["MK0000422", { in_use: true, retired: false, managed_id: "ada" }]]),
    );
    expect(plan.map((item) => item.action)).toEqual(["insert", "insert"]);
    expect(plan.every((item) => item.action === "insert" && item.studentNumber === null)).toBe(true);
  });

  it("rejects a retired ID, a duplicate in the file, and an ID the caller cannot manage", () => {
    const plan = planStudentImport(
      [row("OLD-1"), row("OLD-1"), row("GONE"), row("OTHER")],
      new Map([
        ["OLD-1", { in_use: true, retired: false, managed_id: "kept" }],
        ["GONE", { in_use: false, retired: true, managed_id: null }],
        ["OTHER", { in_use: true, retired: false, managed_id: null }],
      ]),
    );
    expect(plan[0]).toMatchObject({ action: "match", studentId: "kept" });
    expect(plan[1]).toMatchObject({ action: "reject" });
    expect(plan[2]).toMatchObject({ action: "reject", reason: expect.stringMatching(/retired/) });
    expect(plan[3]).toMatchObject({ action: "reject" });
    if (plan[3]?.action === "reject") {
      expect(plan[3].reason).toMatch(/already assigned/);
      expect(plan[3].reason).not.toMatch(/Lovelace|Ada/);
    }
  });

  it("accepts a legacy imported value that is not an MK ID", () => {
    const plan = planStudentImport([row("STU-100")], new Map());
    expect(plan[0]).toMatchObject({ action: "insert", studentNumber: "STU-100", issuer: "imported" });
  });
});

describe("correction, withdraw, and authorization", () => {
  it("requires an admin and a reason, retires the old ID, and refuses a reused or bad check digit", () => {
    expect(
      planStudentNumberCorrection({
        isAdmin: false,
        reason: "typo",
        current: "MK0000422",
        next: "MK0000430",
        takenByOther: false,
        retired: false,
      }),
    ).toMatchObject({ ok: false });

    expect(
      planStudentNumberCorrection({
        isAdmin: true,
        reason: "  ",
        current: "MK0000422",
        next: "LEGACY",
        takenByOther: false,
        retired: false,
      }),
    ).toMatchObject({ ok: false });

    const corrected = planStudentNumberCorrection({
      isAdmin: true,
      reason: "Digit was transposed",
      current: "MK0000422",
      next: " stu-100 ",
      takenByOther: false,
      retired: false,
    });
    expect(corrected).toEqual({
      ok: true,
      changed: true,
      retire: "MK0000422",
      next: "STU-100",
      issuer: "corrected",
    });

    expect(
      planStudentNumberCorrection({
        isAdmin: true,
        reason: "Digit was transposed",
        current: "STU-100",
        next: "MK0000420",
        takenByOther: false,
        retired: false,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/check digit/) });

    expect(
      planStudentNumberCorrection({
        isAdmin: true,
        reason: "Digit was transposed",
        current: "STU-100",
        next: "STU-100",
        takenByOther: false,
        retired: true,
      }),
    ).toMatchObject({ ok: true, changed: false, retire: null });

    expect(
      planStudentNumberCorrection({
        isAdmin: true,
        reason: "Digit was transposed",
        current: "STU-100",
        next: "RETIRED",
        takenByOther: false,
        retired: true,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/retired/) });
  });

  it("keeps the row and the ID on withdraw and retires the ID only when the record is destroyed", () => {
    expect(planStudentExit("withdrawn")).toEqual({
      keepsRow: true,
      retiresNumber: false,
      nextStatus: "withdrawn",
    });
    expect(planStudentExit("transferred_out").retiresNumber).toBe(false);
    expect(planStudentExit("graduated").keepsRow).toBe(true);
    expect(planStudentExit("no_show").retiresNumber).toBe(false);
    expect(planStudentExit("destroy")).toEqual({
      keepsRow: false,
      retiresNumber: true,
      nextStatus: null,
    });
  });

  it("lets a manager issue or change status, and only an admin correct or destroy", () => {
    const teacher = { isAdmin: false, canManage: true };
    const stranger = { isAdmin: false, canManage: false };
    const admin = { isAdmin: true, canManage: false };
    expect(authorizeStudentIdAction("issue", teacher).ok).toBe(true);
    expect(authorizeStudentIdAction("status", teacher).ok).toBe(true);
    expect(authorizeStudentIdAction("correct", teacher).ok).toBe(false);
    expect(authorizeStudentIdAction("destroy", teacher).ok).toBe(false);
    expect(authorizeStudentIdAction("issue", stranger).ok).toBe(false);
    expect(authorizeStudentIdAction("correct", admin).ok).toBe(true);
    expect(authorizeStudentIdAction("destroy", admin).ok).toBe(true);
  });

  it("turns a unique-index failure into a plain assignment message", () => {
    expect(studentIdWriteError('duplicate key value violates unique constraint "students_student_number_key"')).toMatch(
      /already assigned/,
    );
  });
});

describe("database migration", () => {
  it("ships the same SQL in both migration trees", () => {
    expect(supabase).toBe(drizzle);
  });

  it("preserves existing IDs, issues blanks, and does not loosen student access helpers", () => {
    expect(drizzle).toContain("student_number_issuer = 'imported'");
    expect(drizzle).toContain("Existing student ID kept");
    expect(drizzle).toContain("ORDER BY created_at ASC, id ASC");
    expect(drizzle).toContain("duplicate_reissued");
    expect(drizzle).toContain("assign_issued_student_number");
    expect(drizzle).toContain("IF existing IS NOT NULL THEN");
    expect(drizzle).toContain("RETURN existing;");
    expect(drizzle).toContain("nextval('public.student_number_seq')");
    expect(drizzle).not.toContain("CREATE OR REPLACE FUNCTION public.can_view_student");
    expect(drizzle).not.toContain("CREATE OR REPLACE FUNCTION public.can_manage_student");
  });

  it("locks issued IDs, retires them on delete, and keeps them on a status change", () => {
    expect(drizzle).toContain("Student ID is locked. Only an administrator can correct it, and the old ID is retired.");
    expect(drizzle).toContain("A student ID cannot be cleared.");
    expect(drizzle).toContain("That student ID was retired and cannot be reused.");
    expect(drizzle).toContain("Only an administrator can correct a student ID.");
    expect(drizzle).toContain("A reason is required to correct a student ID.");
    expect(drizzle).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.students");
    expect(drizzle).toContain("Student record destroyed. The ID cannot be reused.");
    const statusFn = drizzle.slice(
      drizzle.indexOf("FUNCTION public.set_student_status"),
      drizzle.indexOf("FUNCTION public.lookup_student_numbers"),
    );
    expect(statusFn).toContain("The student record and student ID stay on file.");
    expect(statusFn).not.toContain("retired_student_numbers");
    const deletePolicy = drizzle.slice(
      drizzle.indexOf('CREATE POLICY "students delete admin"'),
      drizzle.indexOf("ALTER TABLE public.retired_student_numbers ENABLE ROW LEVEL SECURITY"),
    );
    expect(deletePolicy).toContain("USING (public.is_admin())");
    expect(deletePolicy).not.toContain("can_manage_student");
  });

  it("checks the ISO example in the migration itself", () => {
    expect(drizzle).toContain("luhn_check_digit('000042') IS DISTINCT FROM '2'");
    expect(drizzle).toContain("is_valid_issued_student_number('MK0000422')");
    expect(drizzle).toContain("MK0000420 is not an ISO Luhn student ID");
    expect(drizzle).toContain("NOT (public.is_admin() OR public.can_manage_student(_student_id))");
    expect(drizzle).toContain("students_student_number_key");
  });
});

describe("privacy policy", () => {
  const privacy = readFileSync("src/routes/privacy.tsx", "utf8");

  it("lists student IDs as education records kept after withdrawal or graduation", () => {
    expect(privacy).toContain("student ID");
    expect(privacy).toContain("not directory information");
    expect(privacy).toMatch(/withdraws, transfers, or graduates/);
    expect(privacy).toContain("never given to another student");
  });
});

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  inRows: vi.fn(),
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
  createMiddleware: () => ({}),
}));

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));

function supabaseMock() {
  const query = {
    update(patch: unknown) {
      mocks.update(patch);
      return query;
    },
    insert(patch: unknown) {
      mocks.insert(patch);
      return query;
    },
    select() {
      return query;
    },
    eq() {
      return query;
    },
    in: () => Promise.resolve({ data: mocks.inRows(), error: null as null }),
    maybeSingle: () => mocks.maybeSingle(),
    then(resolve: (value: { error: null }) => unknown) {
      return resolve({ error: null });
    },
  };
  return { rpc: mocks.rpc, from: () => query };
}

describe("student ID server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "is_staff") return { data: true, error: null };
      if (name === "is_admin") return { data: false, error: null };
      if (name === "issue_student_number") return { data: "MK0000018", error: null };
      if (name === "lookup_student_numbers") return { data: [], error: null };
      return { data: null, error: null };
    });
    mocks.maybeSingle.mockResolvedValue({ data: { student_number: "MK0000018" }, error: null });
    mocks.inRows.mockReturnValue([]);
  });

  it("does not call the correction RPC unless the caller is an admin", async () => {
    const { correctStudentNumber, issueStudentNumber } = await import("./student-ids.functions");
    const correct = correctStudentNumber as unknown as (input: {
      data: { studentId: string; newNumber: string; reason: string };
      context: { supabase: ReturnType<typeof supabaseMock> };
    }) => Promise<unknown>;
    const issue = issueStudentNumber as unknown as (input: {
      data: { studentId: string };
      context: { supabase: ReturnType<typeof supabaseMock> };
    }) => Promise<{ studentNumber: string }>;
    const context = { supabase: supabaseMock() };

    await expect(
      correct({
        data: {
          studentId: "00000000-0000-4000-8000-000000000001",
          newNumber: "STU-1",
          reason: "Typo in the file",
        },
        context,
      }),
    ).rejects.toThrow(/administrator/);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).not.toContain("correct_student_number");

    await expect(
      issue({ data: { studentId: "00000000-0000-4000-8000-000000000001" }, context }),
    ).resolves.toEqual({ studentNumber: "MK0000018" });
    expect(mocks.rpc).toHaveBeenCalledWith("issue_student_number", {
      _student_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("matches an import without writing a new student ID and inserts a blank as null", async () => {
    mocks.rpc.mockImplementation(async (name: string, args?: { _numbers?: string[] }) => {
      if (name === "is_staff") return { data: true, error: null };
      if (name === "lookup_student_numbers") {
        return {
          data: (args?._numbers ?? []).map((student_number) => ({
            student_number,
            in_use: student_number === "MK0000422",
            retired: false,
            managed_id: student_number === "MK0000422" ? "00000000-0000-4000-8000-000000000002" : null,
          })),
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mocks.inRows.mockReturnValue([
      {
        id: "00000000-0000-4000-8000-000000000002",
        user_id: "user-1",
        guardian_user_id: null,
        guardian_email: "ada@school.test",
        student_number: "MK0000422",
      },
    ]);
    const { importStudentIdentities } = await import("./student-ids.functions");
    const run = importStudentIdentities as unknown as (input: {
      data: {
        rows: {
          first_name: string;
          last_name: string;
          grade_level: number;
          student_number?: string | null;
        }[];
      };
      context: { supabase: ReturnType<typeof supabaseMock> };
    }) => Promise<{ students: { action: string; id: string; student_number: string | null }[] }>;

    const result = await run({
      data: {
        rows: [
          { first_name: "Ada", last_name: "Lovelace", grade_level: 7, student_number: "MK0000422" },
          { first_name: "Ada", last_name: "Lovelace", grade_level: 7, student_number: null },
        ],
      },
      context: { supabase: supabaseMock() },
    });

    expect(result.students.map((student) => student.action)).toEqual(["matched", "created"]);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("student_number");
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({ student_number: null, first_name: "Ada" });
    expect(result.students[0]?.student_number).toBe("MK0000422");
  });

  it("refuses an import of an ID the caller cannot manage before inserting", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "is_staff") return { data: true, error: null };
      if (name === "lookup_student_numbers") {
        return {
          data: [{ student_number: "OTHER", in_use: true, retired: false, managed_id: null }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { importStudentIdentities } = await import("./student-ids.functions");
    const run = importStudentIdentities as unknown as (input: {
      data: { rows: { first_name: string; last_name: string; grade_level: number; student_number: string }[] };
      context: { supabase: ReturnType<typeof supabaseMock> };
    }) => Promise<unknown>;
    await expect(
      run({
        data: { rows: [{ first_name: "New", last_name: "Student", grade_level: 6, student_number: "OTHER" }] },
        context: { supabase: supabaseMock() },
      }),
    ).rejects.toThrow(/already assigned/);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
