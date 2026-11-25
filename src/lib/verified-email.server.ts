import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve only linked, email-confirmed Auth accounts; never trust contact/profile email. */
export async function verifiedLinkedEmails(
  admin: Pick<SupabaseClient, "auth">,
  linkedIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(linkedIds.filter((id): id is string => !!id))];
  const emails = new Map<string, string>();
  for (let start = 0; start < ids.length; start += 10) {
    await Promise.all(ids.slice(start, start + 10).map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        const user = data?.user;
        const email = user?.email;
        if (error || user?.id !== id || !user.email_confirmed_at || !email) return;
        if (!email.includes("@") || email.toLowerCase().endsWith(".local")) return;
        emails.set(id, email);
      } catch {
        // An unavailable verification lookup must never enable contact-email fallback.
      }
    }));
  }
  return emails;
}