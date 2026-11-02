import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Self-service password reset. Accounts may sign in with a username backed by
 * a synthetic email that cannot receive mail, so we generate a recovery link
 * server-side and deliver it to the contact email registered on the profile.
 * Always succeeds from the caller's perspective to avoid account enumeration.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        origin: z.string().url().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, username")
      .ilike("email", data.email)
      .maybeSingle();

    if (!profile) return { ok: true };

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      profile.id,
    );
    if (authError || !authData.user?.email) return { ok: true };

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: authData.user.email,
      options: { redirectTo: `${data.origin}/reset-password` },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkError || !actionLink) return { ok: true };

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("password-reset", profile.email ?? data.email, {
      templateData: {
        recipientName: profile.full_name ?? undefined,
        username: profile.username ?? undefined,
        resetUrl: actionLink,
      },
    }).catch(() => undefined);

    return { ok: true };
  });
