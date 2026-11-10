import { useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { recordLogin } from "@/lib/login-tracking";
import { needsSecondFactor } from "@/lib/mfa-client";
import { useAuth } from "@/hooks/useAuth";
import { useIntegrityGuard } from "@/hooks/useIntegrityGuard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    let { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Right after sign-in, the preview's brokered session storage can answer
      // with a stale empty value before the new session syncs. Retry once after
      // a short delay so a successful sign-in isn't bounced back to /auth.
      await new Promise((r) => setTimeout(r, 400));
      ({ data, error } = await supabase.auth.getUser());
    }
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (await needsSecondFactor()) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isStaff, loading } = useAuth();

  // Record one sign-in per browser session (covers OAuth/restored sessions;
  // password sign-ins also call recordLogin directly from the auth page).
  useEffect(() => {
    void recordLogin();
  }, []);

  // Students and guardians may not script, bot or run code — automation attempts
  // earn an automatic behavior strike.
  useIntegrityGuard(!loading && !isStaff);

  return <Outlet />;
}
