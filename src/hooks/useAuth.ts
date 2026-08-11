import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "teacher" | "student" | "parent";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useAuth() {
  const { session, user, loading } = useSession();

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from("user_roles").select("role");
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const primaryRole: Role = roles.includes("admin")
    ? "admin"
    : roles.includes("teacher")
      ? "teacher"
      : roles.includes("parent")
        ? "parent"
        : "student";

  return {
    session,
    user: user as User | null,
    profile,
    roles,
    primaryRole,
    isStaff: roles.includes("admin") || roles.includes("teacher"),
    isAdmin: roles.includes("admin"),
    loading: loading || (!!user && rolesLoading),
  };
}
