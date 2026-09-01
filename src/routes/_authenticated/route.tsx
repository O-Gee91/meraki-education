import { useEffect } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { recordLogin } from "@/lib/login-tracking";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // Record one sign-in per browser session (covers OAuth/restored sessions;
  // password sign-ins also call recordLogin directly from the auth page).
  useEffect(() => {
    void recordLogin();
  }, []);
  return <Outlet />;
}
