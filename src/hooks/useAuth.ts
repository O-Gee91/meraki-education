import { useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useActingRoleStore } from "@/hooks/useActingRole";
import { useStudentPreviewMode } from "@/hooks/useStudentPreview";
import { createSharedSessionStore } from "@/lib/shared-session";

export type Role = "admin" | "teacher" | "student" | "parent";

const sessionStore = createSharedSessionStore<Session>({
  read: async () => (await supabase.auth.getSession()).data.session,
  listen: (onSession) => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => onSession(next));
    return () => data.subscription.unsubscribe();
  },
});

export function useSession() {
  const { session, loading } = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  return { session, user: session?.user ?? null, loading };
}

export function useAuth() {
  const { session, user, loading } = useSession();

  const { data: fetchedRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Role[]> => {
      if (!user) return [];
      // Admins can read every row in user_roles, so this MUST stay scoped to the
      // signed-in account or an admin would appear to hold every role.
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });


  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user.id)
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
  const realStaff = hasAdminRole || hasTeacherRole;
  // Only people who genuinely hold both hats get to switch between them.
  const storedPreview = useStudentPreviewMode();
  const previewingStudent = realStaff && storedPreview;
  const canSwitchRole = hasAdminRole && hasTeacherRole && !previewingStudent;

  const storedActingRole = useActingRoleStore();
  const actingRole: Role | null = canSwitchRole ? (storedActingRole ?? "admin") : null;

  const baseRole: Role = previewingStudent
    ? "student"
    : hasAdminRole
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
    hasAdminRole: hasAdminRole && !previewingStudent,
    hasTeacherRole: hasTeacherRole && !previewingStudent,
    /** False while staff use the global "View as student" preview. */
    isStaff: realStaff && !previewingStudent,
    /** The account really holds a staff role, even while previewing as a student. */
    realStaff,
    /** Staff are browsing the app as the demo Student Tester (read-only). */
    previewingStudent,
    /** Reflects the active hat, so an admin working as a teacher stays class-scoped. */
    isAdmin: primaryRole === "admin",
    /**
     * True when a staff member is deliberately working as a teacher. Row-level
     * security still allows an admin to read everything, so lists must narrow
     * themselves to the classes this person teaches while this is on.
     */
    teacherMode: primaryRole === "teacher" && hasTeacherRole && !previewingStudent,
    loading: loading || (!!user && rolesLoading),
  };
}
