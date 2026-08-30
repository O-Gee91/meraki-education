import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerMyEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data, context }) => {
    const email = (data.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255)
      throw new Error("That email address looks invalid");
    if (email.endsWith("@meraki.local"))
      throw new Error("Use a real email address you can receive mail at");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (taken && taken.id !== context.userId)
      throw new Error("Another account already uses that email address");

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { contact_email: email },
    });
    if (authError) throw new Error(authError.message);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ email })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { email };
  });
