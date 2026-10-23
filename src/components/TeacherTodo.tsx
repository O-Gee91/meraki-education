import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, FileClock, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { markCodeFromComment } from "@/lib/grading";

type Item = { key: string; classId: string; className: string; kind: string; count: number; icon: typeof ListChecks };

/** Educator to-do feed: work waiting to be graded, unreleased draft grades, assessments to review. */
export function TeacherTodo({ classes }: { classes: { id: string; name: string }[] }) {
  const ids = classes.map((c) => c.id);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["teacher-todo", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Item[]> => {
      const { data: assignments, error: aErr } = await supabase
        .from("assignments")
        .select("id, class_id")
        .in("class_id", ids);
      if (aErr) throw aErr;
      const aClass = new Map((assignments ?? []).map((a) => [a.id, a.class_id]));
      const aIds = [...aClass.keys()];
      const { data: assessments, error: sErr } = await supabase
        .from("assessments")
        .select("id, class_id")
        .in("class_id", ids);
      if (sErr) throw sErr;
      const sClass = new Map((assessments ?? []).map((a) => [a.id, a.class_id]));
      const sIds = [...sClass.keys()];

      const [subs, grades, attempts] = await Promise.all([
        aIds.length
          ? supabase.from("assignment_submissions").select("assignment_id, student_id, status").in("assignment_id", aIds).in("status", ["submitted", "collected"])
          : Promise.resolve({ data: [], error: null }),
        aIds.length
          ? supabase.from("grades").select("assignment_id, student_id, points_earned, comment, is_draft").in("assignment_id", aIds)
          : Promise.resolve({ data: [], error: null }),
        sIds.length
          ? supabase.from("assessment_submissions").select("assessment_id, status").in("assessment_id", sIds).eq("status", "submitted")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (subs.error) throw subs.error;
      if (grades.error) throw grades.error;
      if (attempts.error) throw attempts.error;

      const scored = new Set<string>();
      const toGrade = new Map<string, number>();
      const drafts = new Map<string, number>();
      const toReview = new Map<string, number>();
      const bump = (m: Map<string, number>, k: string | undefined) => k && m.set(k, (m.get(k) ?? 0) + 1);

      for (const g of grades.data ?? []) {
        if (g.points_earned != null || markCodeFromComment(g.comment)) {
          scored.add(`${g.assignment_id}:${g.student_id}`);
          if (g.is_draft) bump(drafts, aClass.get(g.assignment_id));
        }
      }
      for (const s of subs.data ?? []) {
        if (!scored.has(`${s.assignment_id}:${s.student_id}`)) bump(toGrade, aClass.get(s.assignment_id));
      }
      for (const a of attempts.data ?? []) bump(toReview, sClass.get(a.assessment_id));

      const name = new Map(classes.map((c) => [c.id, c.name]));
      const out: Item[] = [];
      const push = (m: Map<string, number>, kind: string, icon: typeof ListChecks) => {
        for (const [classId, count] of m) out.push({ key: `${kind}-${classId}`, classId, className: name.get(classId) ?? "Class", kind, count, icon });
      };
      push(toGrade, "to grade", ListChecks);
      push(drafts, "draft grades to post", FileClock);
      push(toReview, "assessments to review", ClipboardCheck);
      return out.sort((x, y) => y.count - x.count);
    },
  });

  return (
    <section className="mt-6 border-b border-border pb-6">
      <h2 className="text-lg font-semibold">To do</h2>
      {isLoading && ids.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking your classes…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing waiting on you right now.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((i) => (
            <li key={i.key}>
              <Link
                to="/classes/$classId"
                params={{ classId: i.classId }}
                className="flex items-center justify-between gap-4 py-3 text-sm hover:text-accent"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <i.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="break-words">
                    <strong className="tabular-nums">{i.count}</strong> {i.kind}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">{i.className}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
