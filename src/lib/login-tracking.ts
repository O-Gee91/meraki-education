import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "meraki-login-recorded";

/**
 * Records a sign-in event for the current user, at most once per browser
 * session. Covers both password sign-ins and OAuth/session restores.
 * Best-effort: failures are ignored so login is never blocked.
 */
export async function recordLogin(): Promise<void> {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    await supabase.from("login_events").insert({ user_id: data.user.id });
  } catch {
    // never block sign-in on tracking
  }
}
