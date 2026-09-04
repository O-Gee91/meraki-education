import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Emails the recipient of an in-app message so notifications reach their inbox too.
 * The message row itself is created by the caller under RLS; this only notifies.
 */
export const notifyMessageRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { message_id: string }) => {
    if (!input?.message_id) throw new Error("message_id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: message, error } = await supabase
      .from("messages")
      .select("id, subject, body, sender_id, recipient_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (error) throw error;
    if (!message || message.sender_id !== userId) return { sent: false as const };

    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [message.sender_id, message.recipient_id]);

    const recipient = people?.find((p) => p.id === message.recipient_id);
    const sender = people?.find((p) => p.id === message.sender_id);
    const email = recipient?.email?.trim();
    if (!email || !email.includes("@")) return { sent: false as const };

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const origin = process.env["PUBLIC_SITE_URL"] ?? "https://meraki-education.app";

    try {
      const result = await sendTemplateEmail("message-notification", email, {
        templateData: {
          recipientName: recipient?.full_name || undefined,
          senderName: sender?.full_name || "Meraki Education",
          subject: message.subject,
          body: message.body.slice(0, 1200),
          inboxUrl: `${origin}/messages`,
        },
        idempotencyKey: `message-notification-${message.id}`,
      });
      return { sent: result.sent };
    } catch (err) {
      // Email delivery is best-effort: the in-app message is already stored.
      console.error("Failed to email message notification", err);
      return { sent: false as const };
    }
  });
