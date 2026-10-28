import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchCoTaughtClassIds } from "@/hooks/useCoTaughtClasses";

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

  const { data } = useQuery({
    queryKey: ["teacher-scope", user?.id, profile?.full_name, teacherMode],
    enabled: !!user && teacherMode,
    queryFn: async () => {
      const { data: classes, error } = await supabase
        .from("classes")
        .select("id, teacher_id, teacher_name, grade_level");
      if (error) throw error;

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

      const { data: enrollments, error: eErr } = await supabase
        .from("enrollments")
        .select("student_id, class_id")
        .in("class_id", [...classIds]);
      if (eErr) throw eErr;

      return {
        classIds,
        studentIds: new Set((enrollments ?? []).map((e) => e.student_id)),
        gradeLevels,
      };
    },
  });

  // "View as student": narrow everything to the demo Student Tester, because
  // staff row-level security would otherwise return the whole school.
  const { data: preview } = useQuery({
    queryKey: ["preview-scope", user?.id, previewingStudent],
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
      const { data: enrollments, error: eErr } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("student_id", tester.id);
      if (eErr) throw eErr;
      return {
        classIds: new Set((enrollments ?? []).map((e) => e.class_id)),
        studentIds: new Set([tester.id]),
        gradeLevels: new Set(tester.grade_level == null ? [] : [tester.grade_level]),
      };
    },
  });

  if (previewingStudent) {
    // Until resolved, scope to nothing rather than everything.
    const empty = { classIds: new Set<string>(), studentIds: new Set<string>(), gradeLevels: new Set<number>() };
    const scope = preview ?? empty;
    return { teacherMode: false, ...scope, scoped: !!preview };
  }

  const active = teacherMode && !!data;

  return {
    teacherMode,
    /** Class ids in scope, or null when nothing should be filtered. */
    classIds: active ? data!.classIds : null,
    /** Student ids in scope, or null when nothing should be filtered. */
    studentIds: active ? data!.studentIds : null,
    /** Grade levels taught, or null when nothing should be filtered. */
    gradeLevels: active ? data!.gradeLevels : null,
    /** True once teacher-mode scoping data is ready. */
    scoped: active,
  };
}
