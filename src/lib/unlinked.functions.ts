import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LinkInput } from "./unlinked.server";

export const getUnlinkedAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can view pending accounts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listUnlinkedAccounts } = await import("./unlinked.server");
    return { accounts: await listUnlinkedAccounts(supabaseAdmin) };
  });

export const linkSelfRegisteredAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LinkInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can link accounts");
    if (!data.user_id) throw new Error("Missing account");
    if (data.class_id) {
      const { data: canManage } = await context.supabase.rpc("can_manage_class", {
        _class_id: data.class_id,
      });
      if (!canManage) throw new Error("You cannot add students to that class");
    }
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) {
      if (data.student_id) {
        const { data: canStudent } = await context.supabase.rpc("can_manage_student", {
          _student_id: data.student_id,
        });
        if (!canStudent) throw new Error("You can only link accounts to students in your classes");
      } else if (!data.class_id) {
        throw new Error("Choose one of your classes for this new student");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linkAccountToStudent } = await import("./unlinked.server");
    return linkAccountToStudent(supabaseAdmin, data);
  });
