import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ResetInput } from "./accounts.server";

export const resetStudentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ResetInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can reset account access");
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!data.user_id) throw new Error("Missing account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!isAdmin) {
      // Teachers may only reset accounts linked to students they manage.
      const { data: linked, error: linkErr } = await supabaseAdmin
        .from("students")
        .select("id")
        .or(`user_id.eq.${data.user_id},guardian_user_id.eq.${data.user_id}`);
      if (linkErr) throw new Error(linkErr.message);
      let allowed = false;
      for (const s of linked ?? []) {
        const { data: ok } = await context.supabase.rpc("can_manage_student", { _student_id: s.id });
        if (ok) { allowed = true; break; }
      }
      if (!allowed) throw new Error("You can only reset accounts for students in your classes");
    }
    const { resetAccountAccess } = await import("./accounts.server");
    return resetAccountAccess(supabaseAdmin, data, {
      userId: context.userId,
      isAdmin: !!isAdmin,
    });
  });
