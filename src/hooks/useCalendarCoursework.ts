import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { useTeacherScope } from "@/hooks/useTeacherScope";
import {
  dayInZone,
  dedupeLinkedAssignments,
  timeInZone,
  type CourseworkItem,
} from "@/lib/calendar-coursework";

/**
 * Due dates of assignments, assessments and discussions for one month,
 * scoped to the viewer: students/guardians see their enrolled classes,
 * teachers their own classes, admins the whole school. Polls so newly posted
 * or changed due dates show up without a refresh.
 */
export function useCalendarCoursework(monthStart: string, monthEnd: string) {
  const { user, isStaff, previewingStudent } = useAuth();
  const scope = useTeacherScope();
  const { ids: selfIds } = useSelfStudents();
  const studentView = !isStaff || previewingStudent;
  const scopeKey = scope.classIds ? [...scope.classIds].sort().join(",") : "all";
  const queryClient = useQueryClient();

  // Refresh right after this browser saves, edits or deletes coursework.
  useEffect(() => {
    const watched = new Set([
      "assignments", "assessments", "discussions",
      // Hand-ins and grading change the "Completed" badge.
      "assignment-submissions", "assessment-submissions", "grades", "assignment-grades",
      "discussion-posts", "posts",
    ]);
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "invalidate") return;
      if (!watched.has(String(event.query.queryKey[0]))) return;
      void queryClient.invalidateQueries({ queryKey: ["calendar-coursework"] });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: ["calendar-coursework", monthStart, user?.id, studentView, selfIds.join(","), scopeKey],
    enabled: !!user && (!studentView || selfIds.length > 0),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CourseworkItem[]> => {
      let classIds: string[] | null = scope.classIds ? [...scope.classIds] : null;
      if (studentView) {
        const { data, error } = await supabase
          .from("enrollments")
          .select("class_id")
          .in("student_id", selfIds);
        if (error) throw error;
        const enrolled = [...new Set((data ?? []).map((e) => e.class_id))];
        classIds = previewingStudent && scope.classIds
          ? enrolled.filter((id) => scope.classIds!.has(id))
          : enrolled;
      }
      if (classIds && classIds.length === 0) return [];

      const { data: classes, error: cErr } = await (classIds
        ? supabase.from("classes").select("id, name, timezone").in("id", classIds)
        : supabase.from("classes").select("id, name, timezone"));
      if (cErr) throw cErr;
      const classById = new Map((classes ?? []).map((c) => [c.id, c]));
      const ids = classIds ?? [...classById.keys()];
      if (ids.length === 0) return [];
      // Pad by a day either side; timed items are re-bucketed by class zone.
      const from = new Date(`${monthStart}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 1);
      const to = new Date(`${monthEnd}T23:59:59Z`);
      to.setUTCDate(to.getUTCDate() + 1);

      let aQ = supabase
        .from("assignments")
        .select("id, title, class_id, due_date, status")
        .in("class_id", ids)
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd);
      if (studentView) aQ = aQ.eq("status", "published");
      let sQ = supabase
        .from("assessments")
        .select("id, title, class_id, due_at, published, assignment_id")
        .in("class_id", ids)
        .gte("due_at", from.toISOString())
        .lte("due_at", to.toISOString());
      if (studentView) sQ = sQ.eq("published", true);
      const dQ = supabase
        .from("discussions")
        .select("id, title, class_id, due_at, due_date, assignment_id, thread_id")
        .in("class_id", ids)
        .or(
          `and(due_at.gte.${from.toISOString()},due_at.lte.${to.toISOString()}),and(due_at.is.null,due_date.gte.${monthStart},due_date.lte.${monthEnd})`,
        );
      const [a, s, d] = await Promise.all([aQ, sQ, dQ]);
      if (a.error) throw a.error;
      if (s.error) throw s.error;
      if (d.error) throw d.error;

      // Completion for the student viewer.
      const done = new Set<string>();
      if (studentView && selfIds.length) {
        const aIds = (a.data ?? []).map((x) => x.id);
        const sIds = (s.data ?? []).map((x) => x.id);
        const [subs, grades, aSubs] = await Promise.all([
          aIds.length
            ? supabase.from("assignment_submissions").select("assignment_id").in("assignment_id", aIds).in("student_id", selfIds).in("status", ["submitted", "collected", "returned"])
            : Promise.resolve({ data: [] as { assignment_id: string }[] }),
          aIds.length
            ? supabase.from("grades").select("assignment_id").in("assignment_id", aIds).in("student_id", selfIds).eq("is_draft", false)
            : Promise.resolve({ data: [] as { assignment_id: string }[] }),
          sIds.length
            ? supabase.from("assessment_submissions").select("assessment_id").in("assessment_id", sIds).in("student_id", selfIds)
            : Promise.resolve({ data: [] as { assessment_id: string }[] }),
        ]);
        for (const r of subs.data ?? []) done.add(`assignment-${r.assignment_id}`);
        for (const r of grades.data ?? []) done.add(`assignment-${r.assignment_id}`);
        for (const r of aSubs.data ?? []) done.add(`assessment-${r.assessment_id}`);
        if (!previewingStudent && user) {
          const hostIds = (d.data ?? []).map((x) => x.thread_id ?? x.id);
          if (hostIds.length) {
            const { data: posts } = await supabase
              .from("discussion_posts")
              .select("discussion_id")
              .in("discussion_id", hostIds)
              .eq("author_id", user.id)
              .is("parent_id", null);
            const posted = new Set((posts ?? []).map((p) => p.discussion_id));
            for (const x of d.data ?? []) if (posted.has(x.thread_id ?? x.id)) done.add(`discussion-${x.id}`);
          }
        }
      }

      const tz = (cid: string) => classById.get(cid)?.timezone || "Asia/Shanghai";
      const name = (cid: string) => classById.get(cid)?.name ?? "Class";
      const linked = new Set<string>();
      const items: CourseworkItem[] = [];
      for (const x of a.data ?? []) {
        if (!x.due_date) continue;
        items.push({
          id: x.id, kind: "assignment", title: x.title, classId: x.class_id, className: name(x.class_id),
          date: x.due_date, time: null, draft: x.status !== "published", completed: done.has(`assignment-${x.id}`),
        });
      }
      for (const x of s.data ?? []) {
        if (!x.due_at) continue;
        if (x.assignment_id) linked.add(x.assignment_id);
        items.push({
          id: x.id, kind: "assessment", title: x.title, classId: x.class_id, className: name(x.class_id),
          date: dayInZone(x.due_at, tz(x.class_id)), time: timeInZone(x.due_at, tz(x.class_id)),
          draft: !x.published, completed: done.has(`assessment-${x.id}`),
        });
      }
      for (const x of d.data ?? []) {
        const date = x.due_at ? dayInZone(x.due_at, tz(x.class_id)) : x.due_date;
        if (!date) continue;
        if (x.assignment_id) linked.add(x.assignment_id);
        items.push({
          id: x.id, kind: "discussion", title: x.title, classId: x.class_id, className: name(x.class_id),
          date, time: x.due_at ? timeInZone(x.due_at, tz(x.class_id)) : null,
          draft: false, completed: done.has(`discussion-${x.id}`),
        });
      }
      return dedupeLinkedAssignments(items, linked).filter((i) => i.date >= monthStart && i.date <= monthEnd);
    },
  });
}
