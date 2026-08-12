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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linkAccountToStudent } = await import("./unlinked.server");
    return linkAccountToStudent(supabaseAdmin, data);
  });
