import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, fetchByIds } from "@/lib/query";
import { useAuth } from "@/hooks/useAuth";
import { fetchCoTaughtClassIds } from "@/hooks/useCoTaughtClasses";

export type TeacherScopeSets = {
  classIds: Set<string>;
  studentIds: Set<string>;
  gradeLevels: Set<number>;
};

export type TeacherScopeView = {
  teacherMode: boolean;
  classIds: Set<string> | null;
  studentIds: Set<string> | null;
  gradeLevels: Set<number> | null;
  scoped: boolean;
  scopeError: boolean;
};

const emptyScope = (): TeacherScopeSets => ({
  classIds: new Set(),
  studentIds: new Set(),
  gradeLevels: new Set(),
});

/**
 * Decides what a notebook surface may list. A failed teacher or preview read
 * returns an empty scope, never the unfiltered school. Loading teacher mode
 * stays null so callers can keep showing a loading state instead of zero classes.
 */
export function resolveTeacherScopeView(input: {
  teacherMode: boolean;
  previewingStudent: boolean;
  teacherData: TeacherScopeSets | undefined;
  teacherError: boolean;
  previewData: TeacherScopeSets | undefined;
  previewError: boolean;
}): TeacherScopeView {
  if (input.previewingStudent) {
    if (input.previewError || !input.previewData) {
      return { teacherMode: false, ...emptyScope(), scoped: false, scopeError: input.previewError };
    }
    return { teacherMode: false, ...input.previewData, scoped: true, scopeError: false };
  }
  if (input.teacherMode && input.teacherError) {
    return { teacherMode: true, ...emptyScope(), scoped: false, scopeError: true };
  }
  if (input.teacherMode && input.teacherData) {
    return { teacherMode: true, ...input.teacherData, scoped: true, scopeError: false };
  }
  return {
    teacherMode: input.teacherMode,
    classIds: null,
    studentIds: null,
    gradeLevels: null,
    scoped: false,
    scopeError: false,
  };
}

/**
 * When a staff member with both hats is deliberately working as a teacher,
 * every list must narrow itself to the classes they teach — row-level security
 * still lets an admin read the whole school, so the narrowing happens here.
 *
 * Returns `null` sets when no narrowing applies (admin mode, or a single-role
 * account), so callers can simply skip filtering.
 */
export function useTeacherScope() {
  const { teacherMode, previewingStudent, user, profile } = useAuth();

  const teacherQuery = useQuery({
    queryKey: ["teacher-scope", user?.id, profile?.full_name, teacherMode],
    enabled: !!user && teacherMode,
    queryFn: async () => {
      const classes = await fetchAll((from, to) =>
        supabase
          .from("classes")
          .select("id, teacher_id, teacher_name, grade_level")
          .order("id")
          .range(from, to),
      );

      const name = (profile?.full_name ?? "").trim().toLowerCase();
      const coTaught = await fetchCoTaughtClassIds(user!.id);
      const mine = (classes ?? []).filter(
        (c) =>
          c.teacher_id === user!.id ||
          coTaught.has(c.id) ||
          (!!name && (c.teacher_name ?? "").trim().toLowerCase() === name),
      );
      const classIds = new Set(mine.map((c) => c.id));

      const gradeLevels = new Set(
        mine.flatMap((schoolClass) =>
          schoolClass.grade_level == null ? [] : [schoolClass.grade_level],
        ),
      );

      if (classIds.size === 0) {
        return { classIds, studentIds: new Set<string>(), gradeLevels };
      }

      const enrollments = await fetchByIds([...classIds], (batch, from, to) =>
        supabase
          .from("enrollments")
          .select("student_id, class_id")
          .in("class_id", batch)
          .order("id")
          .range(from, to),
      );

      return {
        classIds,
        studentIds: new Set((enrollments ?? []).map((e) => e.student_id)),
        gradeLevels,
      };
    },
  });

  // "View as student": narrow everything to the demo Student Tester, because
  // staff row-level security would otherwise return the whole school.
  const previewQuery = useQuery({
    queryKey: ["preview-scope", user?.id, profile?.full_name, previewingStudent],
    enabled: !!user && previewingStudent,
    queryFn: async () => {
      const { data: tester, error } = await supabase
        .from("students")
        .select("id, grade_level")
        .eq("is_tester", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!tester) return { classIds: new Set<string>(), studentIds: new Set<string>(), gradeLevels: new Set<number>() };
      const enrollments = await fetchAll((from, to) =>
        supabase
          .from("enrollments")
          .select("class_id")
          .eq("student_id", tester.id)
          .order("id")
          .range(from, to),
      );
      let classIds = new Set(enrollments.map((e) => e.class_id));

      // Only show the viewing teacher's own (or co-taught) classes. Staff with
      // no classes of their own (e.g. admins) keep the tester's full view.
      const classes = await fetchAll((from, to) =>
        supabase.from("classes").select("id, teacher_id, teacher_name").order("id").range(from, to),
      );
      const name = (profile?.full_name ?? "").trim().toLowerCase();
      const coTaught = await fetchCoTaughtClassIds(user!.id);
      const mine = new Set(
        (classes ?? [])
          .filter(
            (c) =>
              c.teacher_id === user!.id ||
              coTaught.has(c.id) ||
              (!!name && (c.teacher_name ?? "").trim().toLowerCase() === name),
          )
          .map((c) => c.id),
      );
      if (mine.size > 0) classIds = new Set([...classIds].filter((id) => mine.has(id)));

      return {
        classIds,
        studentIds: new Set([tester.id]),
        gradeLevels: new Set(tester.grade_level == null ? [] : [tester.grade_level]),
      };
    },
  });

  return resolveTeacherScopeView({
    teacherMode,
    previewingStudent,
    teacherData: teacherQuery.data,
    teacherError: teacherQuery.isError,
    previewData: previewQuery.data,
    previewError: previewQuery.isError,
  });
}
