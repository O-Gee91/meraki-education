import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProvisionEntry } from "./roster.server";
import { provisionAccountsInput } from "./account-input";

export const provisionStudentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entries: ProvisionEntry[] }) => { provisionAccountsInput.parse(input); return input; })
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can create student accounts");
    if (!Array.isArray(data.entries) || data.entries.length === 0)
      throw new Error("No students selected");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) {
      // Teachers may only provision or reset logins for students they manage,
      // and existing account IDs must match that student's current links.
      const ids = [...new Set(data.entries.map((e) => e.student_id))];
      for (const id of ids) {
        const { data: ok } = await context.supabase.rpc("can_manage_student", { _student_id: id });
        if (!ok) throw new Error("You can only manage logins for students in your classes");
      }
      const { data: rows, error } = await supabaseAdmin
        .from("students")
        .select("id, user_id, guardian_user_id")
        .in("id", ids);
      if (error) throw new Error(error.message);
      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      for (const e of data.entries) {
        const row = byId.get(e.student_id);
        if (!row) throw new Error("Student not found");
        if (e.student_user_id && e.student_user_id !== row.user_id)
          throw new Error("That account is not linked to this student");
        if (e.guardian_user_id && e.guardian_user_id !== row.guardian_user_id)
          throw new Error("That account is not linked to this student");
      }
    }
    const { provisionRosterAccounts } = await import("./roster.server");
    return { accounts: await provisionRosterAccounts(supabaseAdmin, data.entries) };
  });
