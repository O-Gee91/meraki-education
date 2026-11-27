import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  STUDENT_STATUSES,
  importedStudentPatch,
  normalizeStudentNumber,
  planStudentImport,
  studentIdWriteError,
  type ImportLookup,
} from "./student-ids";

const studentIdInput = z.object({
  studentId: z.string().uuid(),
});

const correctInput = z.object({
  studentId: z.string().uuid(),
  newNumber: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(3).max(500),
});

const statusInput = z.object({
  studentId: z.string().uuid(),
  status: z.enum(STUDENT_STATUSES),
});

const importRowsInput = z.object({
  rows: z
    .array(
      z.object({
        first_name: z.string().trim().min(1).max(60),
        last_name: z.string().trim().min(1).max(60),
        grade_level: z.number().int().min(1).max(12),
        student_number: z.string().max(40).nullish(),
        chinese_name: z.string().max(120).nullish(),
        guardian_email: z.string().max(255).nullish(),
      }),
    )
    .min(1)
    .max(1000),
});

export type ImportedStudent = {
  id: string;
  first_name: string;
  last_name: string;
  guardian_email: string | null;
  student_number: string | null;
  action: "created" | "matched";
  user_id: string | null;
  guardian_user_id: string | null;
};

function dbError(error: { message: string }): Error {
  return new Error(studentIdWriteError(error.message));
}

export const issueStudentNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    studentIdInput.parse(input);
    return input as z.infer<typeof studentIdInput>;
  })
  .handler(async ({ data, context }) => {
    const parsed = studentIdInput.parse(data);
    const { data: studentNumber, error } = await context.supabase.rpc("issue_student_number", {
      _student_id: parsed.studentId,
    });
    if (error) throw dbError(error);
    if (!studentNumber) throw new Error("Could not issue a student ID.");
    return { studentNumber };
  });

export const correctStudentNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    correctInput.parse(input);
    return input as z.infer<typeof correctInput>;
  })
  .handler(async ({ data, context }) => {
    const parsed = correctInput.parse(data);
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Only an administrator can correct a student ID.");
    const { data: studentNumber, error } = await context.supabase.rpc("correct_student_number", {
      _student_id: parsed.studentId,
      _new_number: parsed.newNumber,
      _reason: parsed.reason,
    });
    if (error) throw dbError(error);
    if (!studentNumber) throw new Error("Could not correct the student ID.");
    return { studentNumber };
  });

export const setStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    statusInput.parse(input);
    return input as z.infer<typeof statusInput>;
  })
  .handler(async ({ data, context }) => {
    const parsed = statusInput.parse(data);
    const { data: status, error } = await context.supabase.rpc("set_student_status", {
      _student_id: parsed.studentId,
      _status: parsed.status,
    });
    if (error) throw dbError(error);
    return { status: status ?? parsed.status };
  });

/**
 * Match returning students on student_number. A blank ID inserts a new student
 * and the database issues an ID. Name-only matches are not used.
 */
export const importStudentIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    importRowsInput.parse(input);
    return input as z.infer<typeof importRowsInput>;
  })
  .handler(async ({ data, context }) => {
    const parsed = importRowsInput.parse(data);
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can import students");

    const numbers = parsed.rows
      .map((row) => normalizeStudentNumber(row.student_number))
      .filter((number): number is string => !!number);

    const lookup = new Map<string, ImportLookup>();
    if (numbers.length > 0) {
      const { data: found, error } = await context.supabase.rpc("lookup_student_numbers", {
        _numbers: numbers,
      });
      if (error) throw dbError(error);
      for (const row of found ?? []) {
        lookup.set(row.student_number, {
          in_use: row.in_use,
          retired: row.retired,
          managed_id: row.managed_id,
        });
      }
    }

    const plan = planStudentImport(parsed.rows, lookup);
    const rejected = plan.find((item) => item.action === "reject");
    if (rejected && rejected.action === "reject") throw new Error(rejected.reason);

    const students: ImportedStudent[] = [];
    for (const item of plan) {
      if (item.action === "reject") continue;
      const patch = importedStudentPatch(item.row);
      if (item.action === "match") {
        const { error } = await context.supabase
          .from("students")
          .update(patch)
          .eq("id", item.studentId);
        if (error) throw dbError(error);
        students.push({
          id: item.studentId,
          first_name: patch.first_name,
          last_name: patch.last_name,
          guardian_email: patch.guardian_email ?? item.row.guardian_email ?? null,
          student_number: item.studentNumber,
          action: "matched",
          user_id: null,
          guardian_user_id: null,
        });
        continue;
      }

      const id = crypto.randomUUID();
      const { error } = await context.supabase.from("students").insert({
        id,
        ...patch,
        // Null asks the database to issue an ID. A supplied value is kept and marked imported.
        student_number: item.studentNumber,
      });
      if (error) throw dbError(error);
      let studentNumber = item.studentNumber;
      if (!studentNumber) {
        const { data: created } = await context.supabase
          .from("students")
          .select("student_number")
          .eq("id", id)
          .maybeSingle();
        studentNumber = created?.student_number ?? null;
        if (!studentNumber) {
          const { data: issued, error: issueError } = await context.supabase.rpc("issue_student_number", {
            _student_id: id,
          });
          if (!issueError && issued) studentNumber = issued;
        }
      }
      students.push({
        id,
        first_name: patch.first_name,
        last_name: patch.last_name,
        guardian_email: patch.guardian_email ?? null,
        student_number: studentNumber,
        action: "created",
        user_id: null,
        guardian_user_id: null,
      });
    }

    const matchedIds = students.filter((student) => student.action === "matched").map((student) => student.id);
    if (matchedIds.length > 0) {
      const { data: existing, error } = await context.supabase
        .from("students")
        .select("id, user_id, guardian_user_id, guardian_email, student_number")
        .in("id", matchedIds);
      if (error) throw dbError(error);
      const byId = new Map((existing ?? []).map((row) => [row.id, row]));
      for (const student of students) {
        const row = byId.get(student.id);
        if (!row) continue;
        student.user_id = row.user_id;
        student.guardian_user_id = row.guardian_user_id;
        student.guardian_email = row.guardian_email;
        student.student_number = row.student_number;
      }
    }

    return { students };
  });
