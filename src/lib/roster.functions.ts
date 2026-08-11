import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProvisionEntry } from "./roster.server";

export const provisionStudentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entries: ProvisionEntry[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can create student accounts");
    if (!Array.isArray(data.entries) || data.entries.length === 0)
      throw new Error("No students selected");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { provisionRosterAccounts } = await import("./roster.server");
    return { accounts: await provisionRosterAccounts(supabaseAdmin, data.entries) };
  });
