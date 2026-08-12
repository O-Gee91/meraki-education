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
    const { resetAccountAccess } = await import("./accounts.server");
    return resetAccountAccess(supabaseAdmin, data, {
      userId: context.userId,
      isAdmin: !!isAdmin,
    });
  });
