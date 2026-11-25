import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchDiscussionParticipation } from "@/lib/discussion-completion";
import { fetchAll } from "@/lib/query";
import { useAuth } from "@/hooks/useAuth";
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { useTeacherScope } from "@/hooks/useTeacherScope";
import { READ_REUSE_MS, LIVE_REFRESH_MS } from "@/lib/api-query-policy";
import {
  calendarAssignmentComplete,
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
    queryKey: ["calendar-coursework", monthStart, user?.id, studentView, selfIds.join(","), scopeKey, monthEnd],
    enabled: !!user && (!studentView || selfIds.length > 0),
    staleTime: READ_REUSE_MS,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CourseworkItem[]> => {
      let classIds: string[] | null = scope.classIds ? [...scope.classIds] : null;
      const childrenByClass = new Map<string, string[]>();
      if (studentView) {
        const data = await fetchAll((from, to) => supabase
          .from("enrollments")
          .select("class_id, student_id")
          .in("student_id", selfIds).order("id").range(from, to));
        for (const e of data) {
          const children = childrenByClass.get(e.class_id) ?? [];
          children.push(e.student_id);
          childrenByClass.set(e.class_id, children);
        }
        const enrolled = [...new Set((data ?? []).map((e) => e.class_id))];
        classIds = previewingStudent && scope.classIds
          ? enrolled.filter((id) => scope.classIds?.has(id))
          : enrolled;
      }
      if (classIds && classIds.length === 0) return [];

      const classes = await fetchAll((from, to) => {
        let q = supabase.from("classes").select("id, name, timezone");
        if (classIds) q = q.in("id", classIds);
        return q.order("id").range(from, to);
      });
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
        .select("id, title, class_id, due_at, due_date, assignment_id, thread_id, required_replies")
        .in("class_id", ids)
        .or(
          `and(due_at.gte.${from.toISOString()},due_at.lte.${to.toISOString()}),and(due_at.is.null,due_date.gte.${monthStart},due_date.lte.${monthEnd})`,
        );
      const [assignments, assessments, discussions] = await Promise.all([
        fetchAll((from, to) => aQ.order("id").range(from, to)),
        fetchAll((from, to) => sQ.order("id").range(from, to)),
        fetchAll((from, to) => dQ.order("id").range(from, to)),
      ]);

      const done = new Set<string>();
      if (studentView && selfIds.length) {
        const aIds = assignments.map((x) => x.id);
        const sIds = assessments.map((x) => x.id);
        const [subs, grades, aSubs, participation] = await Promise.all([
          aIds.length ? fetchAll((from, to) => supabase.from("assignment_submissions")
            .select("assignment_id, student_id, status").in("assignment_id", aIds).in("student_id", selfIds)
            .order("id").range(from, to)) : Promise.resolve([]),
          aIds.length ? fetchAll((from, to) => supabase.from("grades")
            .select("assignment_id, student_id, points_earned, comment").in("assignment_id", aIds)
            .in("student_id", selfIds).eq("is_draft", false).order("id").range(from, to)) : Promise.resolve([]),
          sIds.length ? fetchAll((from, to) => supabase.from("assessment_submissions")
            .select("assessment_id, student_id, status").in("assessment_id", sIds).in("student_id", selfIds)
            .in("status", ["needs_review", "graded"]).order("id").range(from, to)) : Promise.resolve([]),
          fetchDiscussionParticipation(discussions, selfIds),
        ]);
        // An aggregate family calendar is complete only when every enrolled child is complete.
        for (const a of assignments) {
          const children = childrenByClass.get(a.class_id) ?? [];
          if (children.length > 0 && children.every((sid) => calendarAssignmentComplete(
            subs.find((r) => r.assignment_id === a.id && r.student_id === sid)?.status,
            grades.find((r) => r.assignment_id === a.id && r.student_id === sid),
          ))) done.add(`assignment-${a.id}`);
        }
        for (const a of assessments) {
          const children = childrenByClass.get(a.class_id) ?? [];
          if (children.length > 0 && children.every((sid) => aSubs.some((r) => r.assessment_id === a.id && r.student_id === sid))) {
            done.add(`assessment-${a.id}`);
          }
        }
        for (const d of discussions) {
          const children = childrenByClass.get(d.class_id) ?? [];
          if (children.length > 0 && children.every((sid) => participation.has(`${sid}:${d.id}`))) done.add(`discussion-${d.id}`);
        }
      }

      const tz = (cid: string) => classById.get(cid)?.timezone || "Asia/Shanghai";
      const name = (cid: string) => classById.get(cid)?.name ?? "Class";
      const linked = new Set<string>();
      const items: CourseworkItem[] = [];
      for (const x of assignments) {
        if (!x.due_date) continue;
        items.push({
          id: x.id, kind: "assignment", title: x.title, classId: x.class_id, className: name(x.class_id),
          date: x.due_date, time: null, draft: x.status !== "published", completed: done.has(`assignment-${x.id}`),
        });
      }
      for (const x of assessments) {
        if (!x.due_at) continue;
        if (x.assignment_id) linked.add(x.assignment_id);
        items.push({
          id: x.id, kind: "assessment", title: x.title, classId: x.class_id, className: name(x.class_id),
          date: dayInZone(x.due_at, tz(x.class_id)), time: timeInZone(x.due_at, tz(x.class_id)),
          draft: !x.published, completed: done.has(`assessment-${x.id}`),
        });
      }
      for (const x of discussions) {
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
