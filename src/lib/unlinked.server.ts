import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { compareStudentNames } from "@/lib/student-sort";
import { normalizeStudentNumber } from "@/lib/student-ids";

export type UnlinkedAccount = {
  user_id: string;
  full_name: string;
  email: string | null;
  username: string | null;
  role: "student" | "parent";
  created_at: string;
};

export type LinkInput = {
  user_id: string;
  role: "student" | "parent";
  /** Existing student record to attach to. Omit to create a new student record. */
  student_id?: string | null;
  grade_level?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  student_number?: string | null;
  /** Enroll the linked student into this class straight away. */
  class_id?: string | null;
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? "Student", last: parts[0] ?? "Student" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] as string };
}

/** Accounts that registered themselves but are not attached to any student record yet. */
export async function listUnlinkedAccounts(
  admin: SupabaseClient<Database>,
): Promise<UnlinkedAccount[]> {
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["student", "parent"]);
  if (rolesError) throw new Error(rolesError.message);
  if (!roles || roles.length === 0) return [];

  const { data: students, error: studentsError } = await admin
    .from("students")
    .select("user_id, guardian_user_id");
  if (studentsError) throw new Error(studentsError.message);

  const linkedStudents = new Set((students ?? []).map((s) => s.user_id).filter(Boolean) as string[]);
  const linkedGuardians = new Set(
    (students ?? []).map((s) => s.guardian_user_id).filter(Boolean) as string[],
  );

  // Staff (and anyone who asked for educator access) are never roster candidates,
  // even if a stray student/guardian role is still attached to their account.
  const [{ data: staffRoles, error: staffError }, { data: requests, error: requestError }] =
    await Promise.all([
      admin.from("user_roles").select("user_id").in("role", ["teacher", "admin"]),
      admin.from("staff_access_requests").select("user_id").neq("status", "denied"),
    ]);
  if (staffError) throw new Error(staffError.message);
  if (requestError) throw new Error(requestError.message);
  const staffIds = new Set([
    ...(staffRoles ?? []).map((r) => r.user_id),
    ...(requests ?? []).map((r) => r.user_id),
  ]);

  const candidates = roles.filter(
    (r) =>
      !staffIds.has(r.user_id) &&
      !linkedStudents.has(r.user_id) && !linkedGuardians.has(r.user_id),
  );
  if (candidates.length === 0) return [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, email, username, created_at")
    .in(
      "id",
      candidates.map((c) => c.user_id),
    );
  if (profilesError) throw new Error(profilesError.message);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return candidates
    .map((c) => {
      const p = byId.get(c.user_id);
      if (!p) return null;
      return {
        user_id: c.user_id,
        full_name: p.full_name,
        email: p.email ?? null,
        username: p.username ?? null,
        role: c.role as "student" | "parent",
        created_at: p.created_at,
      } satisfies UnlinkedAccount;
    })
    .filter((v): v is UnlinkedAccount => v !== null)
    .sort((a, b) =>
      compareStudentNames(
        { id: a.user_id, last_name: a.full_name },
        { id: b.user_id, last_name: b.full_name },
      ),
    );
}

/** Attach a self-registered account to an existing student record, or create one for them. */
export async function linkAccountToStudent(
  admin: SupabaseClient<Database>,
  input: LinkInput,
): Promise<{ student_id: string }> {
  // Recheck the same eligibility as the pending-account picker at the write
  // boundary; a submitted profile ID is not authority to replace a link.
  const [roles, requests, studentLinks, guardianLinks] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", input.user_id),
    admin.from("staff_access_requests").select("id").eq("user_id", input.user_id).neq("status", "denied").limit(1),
    admin.from("students").select("id").eq("user_id", input.user_id).limit(1),
    admin.from("students").select("id").eq("guardian_user_id", input.user_id).limit(1),
  ]);
  if ([roles, requests, studentLinks, guardianLinks].some((read) => read.error))
    throw new Error("Unable to verify pending account");
  const accountRoles = (roles.data ?? []).map((row) => row.role);
  if (!accountRoles.includes(input.role) || accountRoles.includes("admin") || accountRoles.includes("teacher") || requests.data?.length)
    throw new Error("Choose a pending student or guardian account with the matching role");
  if (studentLinks.data?.length || guardianLinks.data?.length)
    throw new Error("That account is already linked; ask an administrator to review it");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", input.user_id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Account not found");

  let studentId: string;

  if (input.student_id) {
    const patch =
      input.role === "student"
        ? { user_id: input.user_id }
        : { guardian_user_id: input.user_id, guardian_email: profile.email ?? null };
    const { data, error } = await admin
      .from("students")
      .update(patch)
      .eq("id", input.student_id)
      .is(input.role === "student" ? "user_id" : "guardian_user_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Student not found or already has an account linked");
    studentId = data.id;
  } else {
    if (input.role === "parent")
      throw new Error("Choose the student record this guardian should be linked to");

    const grade = Number(input.grade_level);
    if (!Number.isFinite(grade) || grade < 1 || grade > 12)
      throw new Error("Enter a grade level between 1 and 12");

    const fallback = splitName(profile.full_name);
    const first = (input.first_name ?? "").trim() || fallback.first;
    const last = (input.last_name ?? "").trim() || fallback.last;

    const { data, error } = await admin
      .from("students")
      .insert({
        first_name: first.slice(0, 60),
        last_name: last.slice(0, 60),
        grade_level: grade,
        student_number: normalizeStudentNumber(input.student_number),
        user_id: input.user_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    studentId = data.id;
  }

  // Adding from a class roster: enroll straight away (guardians follow their student).
  if (input.class_id && input.role === "student") {
    const { data: existing } = await admin
      .from("enrollments")
      .select("id")
      .eq("class_id", input.class_id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!existing) {
      const { error } = await admin
        .from("enrollments")
        .insert({ class_id: input.class_id, student_id: studentId });
      if (error) throw new Error(error.message);
    }
  }

  return { student_id: studentId };
}
