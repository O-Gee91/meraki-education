import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useActingRoleStore } from "@/hooks/useActingRole";

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

  const { data: fetchedRoles = [], isLoading: rolesLoading } = useQuery({
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

  // Roles briefly come back empty while queries are invalidated (which happens
  // every time staff switch hats). Falling back to the last known set keeps the
  // Admin/Teacher switch on screen instead of vanishing mid-refetch.
  const lastRoles = useRef<Role[]>([]);
  if (fetchedRoles.length > 0) lastRoles.current = fetchedRoles;
  const roles = fetchedRoles.length > 0 ? fetchedRoles : user ? lastRoles.current : [];

  const hasAdminRole = roles.includes("admin");
  const hasTeacherRole = roles.includes("teacher");
  // Only people who genuinely hold both hats get to switch between them.
  const canSwitchRole = hasAdminRole && hasTeacherRole;

  const storedActingRole = useActingRoleStore();
  const actingRole: Role | null = canSwitchRole ? (storedActingRole ?? "admin") : null;

  const baseRole: Role = hasAdminRole
    ? "admin"
    : hasTeacherRole
      ? "teacher"
      : roles.includes("parent")
        ? "parent"
        : "student";

  const primaryRole: Role = actingRole ?? baseRole;

  return {
    session,
    user: user as User | null,
    profile,
    roles,
    primaryRole,
    /** The role the user is currently acting as (null when they hold only one staff role). */
    actingRole,
    canSwitchRole,
    hasAdminRole,
    hasTeacherRole,
    isStaff: hasAdminRole || hasTeacherRole,
    /** Reflects the active hat, so an admin working as a teacher stays class-scoped. */
    isAdmin: primaryRole === "admin",
    /**
     * True when a staff member is deliberately working as a teacher. Row-level
     * security still allows an admin to read everything, so lists must narrow
     * themselves to the classes this person teaches while this is on.
     */
    teacherMode: primaryRole === "teacher" && hasTeacherRole,
    loading: loading || (!!user && rolesLoading),
  };
}
