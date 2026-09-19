import { supabase } from "@/integrations/supabase/client";

/**
 * A lapsed sign-in session drops requests down to the anonymous key, so the
 * database answers with "permission denied" instead of data. Rather than
 * leaving a half-empty page behind, send the person back to sign in.
 */
function looksLikeExpiredSession(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const message = (err?.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("permission denied") ||
    message.includes("jwt expired") ||
    message.includes("invalid claim")
  );
}

let redirecting = false;

export async function handlePossibleSessionExpiry(error: unknown) {
  if (typeof window === "undefined" || redirecting) return;
  if (!looksLikeExpiredSession(error)) return;

  // Only bail out when the session really is gone — a genuine permission
  // problem for a signed-in user must not log them out.
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return;

  redirecting = true;
  await supabase.auth.signOut().catch(() => undefined);
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/auth?next=${next}`);
}
