import { isMissingWork } from "@/lib/missing-work";
import { missingPointsFor } from "@/lib/late-penalty";
import { fetchDiscussionCompletions } from "@/lib/discussion-completion";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, Megaphone, MessageSquareText, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SchoolCalendar } from "@/components/SchoolCalendar";
import { FeedbackInbox, useMyFeedback, useUnreadFeedback } from "@/components/FeedbackInbox";
import { TeacherTodo } from "@/components/TeacherTodo";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherScope } from "@/hooks/useTeacherScope";
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { READ_REUSE_MS } from "@/lib/api-query-policy";

import { supabase } from "@/integrations/supabase/client";
import { formatDate, gradeTone, percent } from "@/lib/school";
import {
  computeAverage,
  DEFAULT_SCALE,
  letterFor,
  markCodeFromComment,
  parseGradingSetup,
} from "@/lib/grading";

const EVENT_DOT_COLORS: Record<string, string> = {
  red: "bg-destructive",
  amber: "bg-warning",
  green: "bg-success",
  navy: "bg-primary",
};



export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Meraki Education" },
      {
        name: "description",
        content: "Your classes, grades, attendance and school announcements at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Overview — Meraki Education" },
      {
        property: "og:description",
        content: "Your classes, grades, attendance and school announcements at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isStaff, primaryRole, profile, previewingStudent, loading } = useAuth();
  const { classIds, studentIds } = useTeacherScope();
  const { ids: selfIds } = useSelfStudents();
  const today = new Date().toISOString().slice(0, 10);

  const { data: allClasses = [] } = useQuery({
    queryKey: ["classes", "dashboard", user?.id, primaryRole, previewingStudent],
    enabled: Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term, grade_level, weights")
        .order("period");
      if (error) throw error;
      return data;
    },
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students", "dashboard", user?.id, primaryRole, previewingStudent],
    enabled: Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Working as a teacher narrows the overview to their own classes and rosters.
  const classes = classIds ? allClasses.filter((c) => classIds.has(c.id)) : allClasses;
  const students = studentIds ? allStudents.filter((s) => studentIds.has(s.id)) : allStudents;


  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements", "dashboard", user?.id, primaryRole, previewingStudent],
    enabled: Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["my-grades", user?.id, primaryRole, previewingStudent, selfIds],
    enabled: !loading && !isStaff && selfIds.length > 0,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      // Scoped explicitly: staff previewing as a student could otherwise read every grade.
      const { data, error } = await supabase
        .from("grades")
        .select(
          "id, points_earned, comment, updated_at, assignments(id, title, category, points_possible, due_date, class_id, late_penalty_enabled, late_penalty_mode, late_penalty_per_day, late_penalty_zero_after_days)",
        )
        .in("student_id", selfIds)
        .eq("is_draft", false)
        .order("updated_at", { ascending: false })
      if (error) throw error;
      return data;
    },
  });

  // Students and guardians get a visible count of new teacher comments.
  const { data: feedback = [] } = useMyFeedback(!isStaff && !previewingStudent);
  const { unread: unreadFeedback } = useUnreadFeedback(feedback);

  const { data: attendance = [] } = useQuery({
    queryKey: ["my-attendance", user?.id, primaryRole, previewingStudent, selfIds],
    enabled: !loading && !isStaff && selfIds.length > 0,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, status")
        .in("student_id", selfIds)
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: upcomingEventsRaw = [] } = useQuery({
    queryKey: ["staff-upcoming-events", user?.id, primaryRole, today],
    enabled: !loading && isStaff,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, event_date, start_time, end_time, location, category, color, class_id, class_ids, grade_level")
        .gte("event_date", today)
        .order("event_date")
        .order("start_time")
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Teacher mode: only events aimed at their own classes or grade levels.
  const teacherGrades = classIds
    ? new Set(classes.map((c) => (c as { grade_level?: number | null }).grade_level).filter((g): g is number => g != null))
    : null;
  const upcomingEvents = (classIds
    ? upcomingEventsRaw.filter((e) => {
        if (e.class_id && classIds.has(e.class_id)) return true;
        if (e.class_ids?.some((id) => classIds.has(id))) return true;
        if (e.grade_level != null && teacherGrades?.has(e.grade_level)) return true;
        return !e.class_id && (!e.class_ids || e.class_ids.length === 0) && e.grade_level == null;
      })
    : upcomingEventsRaw
  ).slice(0, 8);

  const { data: upcomingAssignments = [] } = useQuery({
    queryKey: ["upcoming-assignments", user?.id, primaryRole, previewingStudent, today],
    enabled: Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, category, due_date, points_possible, class_id, classes(name)")
        .not("due_date", "is", null)
        .gte("due_date", today)
        .order("due_date")
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const { data: upcomingAssessments = [] } = useQuery({
    queryKey: ["upcoming-assessments", user?.id, primaryRole, previewingStudent, today],
    enabled: Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, kind, due_at, class_id, published, classes(name)")
        .eq("published", true)
        .not("due_at", "is", null)
        .gte("due_at", new Date().toISOString())
        .order("due_at")
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  // Teacher mode: only work from their own classes.
  const scopedAssignments = classIds
    ? upcomingAssignments.filter((a) => classIds.has(a.class_id))
    : upcomingAssignments;
  const scopedAssessments = classIds
    ? upcomingAssessments.filter((a) => classIds.has(a.class_id))
    : upcomingAssessments;

  const upcoming = [
    ...scopedAssignments.map((a) => ({
      id: `assignment-${a.id}`,
      title: a.title,
      type: a.category ? `Assignment · ${a.category}` : "Assignment",
      due: a.due_date as string,
      classId: a.class_id,
      className: a.classes?.name ?? "—",
    })),
    ...scopedAssessments.map((a) => ({
      id: `assessment-${a.id}`,
      title: a.title,
      type: `Assessment · ${a.kind.replace("_", " ")}`,
      due: a.due_at as string,
      classId: a.class_id,
      className: a.classes?.name ?? "—",
    })),
  ]
    .sort((x, y) => new Date(x.due).getTime() - new Date(y.due).getTime())
    .slice(0, 8);

  const daysUntil = (due: string) => {
    const d = new Date(due);
    const diff = Math.ceil(
      (new Date(d.toISOString().slice(0, 10)).getTime() -
        new Date(today).getTime()) /
        86_400_000,
    );
    if (diff <= 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return `In ${diff} days`;
  };


  const graded = grades.filter(
    (g) =>
      g.points_earned != null &&
      g.assignments &&
      (!previewingStudent || classIds?.has(g.assignments.class_id)),
  );
  const recentGrades = graded.slice(0, 10);
  const classAverages = classes.flatMap((klass) => {
    const setup = parseGradingSetup(klass.weights);
    const average = computeAverage(
      grades
        .filter((grade) => grade.assignments?.class_id === klass.id)
        .map((grade) => ({
          category: grade.assignments?.category ?? "Homework",
          pointsPossible: Number(grade.assignments?.points_possible ?? 0),
          pointsEarned:
            grade.points_earned == null ? null : Number(grade.points_earned),
          markCode: markCodeFromComment(grade.comment),
          missingPoints: grade.assignments ? missingPointsFor(grade.assignments) : undefined,
        })),
      setup,
    );
    return average == null ? [] : [{ average, scale: setup.scale }];
  });
  const overall = classAverages.length
    ? classAverages.reduce((sum, item) => sum + item.average, 0) / classAverages.length
    : null;
  const overallScale = classAverages.length === 1 ? classAverages[0]?.scale ?? DEFAULT_SCALE : DEFAULT_SCALE;

  return (
    <AppShell
      desktopReview
      title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
      description={
        isStaff
          ? "Your classes, roster and school announcements."
          : "Your grades, upcoming work and news from your teachers."
      }
    >
      <SetupCard />

      {!isStaff && <MissingWorkCard />}


      <div className={`grid gap-x-6 gap-y-5 border-b border-border pb-6 sm:grid-cols-2 ${isStaff ? "xl:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-5"}`}>

        <Stat icon={BookOpen} label="Classes" value={String(classes.length)} />
        {isStaff ? (
          <Stat icon={Users} label="Students" value={String(students.length)} />
        ) : (
          <Stat
            icon={CalendarCheck}
            label="Overall grade"
            value={overall == null ? "—" : `${overall.toFixed(1)}% ${letterFor(overall, overallScale)}`}
            tone={overall == null ? undefined : gradeTone(overall)}
          />
        )}
        <Stat
          icon={Megaphone}
          label="Announcements"
          value={String(announcements.length)}
        />
        {isStaff ? (
          <Stat icon={CalendarCheck} label="Term" value={classes[0]?.term ?? "—"} />
        ) : (
          <>
          <Stat
            icon={CalendarCheck}
            label="Recent attendance"
            value={`${attendance.length} days logged`}
          />
          <Stat
            icon={MessageSquareText}
            label="Teacher feedback"
            value={
              unreadFeedback > 0
                ? `${unreadFeedback} new`
                : feedback.length
                  ? `${feedback.length} comments`
                  : "—"
            }
            tone={unreadFeedback > 0 ? "text-accent" : undefined}
          />
          </>
        )}
      </div>

      {isStaff && <TeacherTodo classes={classes} />}

      <section className="mt-6 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Upcoming due dates</h2>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Assignments &amp; assessments
          </span>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing due right now — you&apos;re all caught up.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {upcoming.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Link
                    to="/classes/$classId"
                    params={{ classId: item.classId }}
                    className="break-words text-sm font-medium hover:text-accent"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {item.className} · {item.type}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{daysUntil(item.due)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.due)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="min-w-0 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Classes</h2>
            <Link to="/classes" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {classes.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No classes yet.{" "}
                {isStaff ? (
                  <Link to="/classes" className="text-accent hover:underline">
                    Create your first class
                  </Link>
                ) : (
                  "Ask the office to add you to a class."
                )}
              </p>
            ) : (
              classes.map((c) => (
                <Link
                  key={c.id}
                  to="/classes/$classId"
                  params={{ classId: c.id }}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm hover:text-accent"
                >
                  <span className="min-w-0 break-words font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.subject ?? "—"} · Period {c.period ?? "—"} · {c.room ?? "no room"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="min-w-0 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <h2 className="text-lg font-semibold">Announcements</h2>
          <div className="mt-4 space-y-4">
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
            ) : (
              announcements.map((a) => (
                <article key={a.id}>
                  <h3 className="text-sm font-semibold">{a.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                </article>
              ))
            )}
          </div>
          {isStaff && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming calendar events
              </h3>
              {upcomingEvents.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No events posted yet — new calendar items will appear here.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {upcomingEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${EVENT_DOT_COLORS[e.color ?? ""] ?? "bg-success"}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(e.event_date)}
                          {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                          {e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}
                          {e.location ? ` · ${e.location}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>






      {!isStaff && !previewingStudent && <FeedbackInbox />}

      {!isStaff && (
        <section className="mt-6 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Recent scores</h2>
          {recentGrades.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No graded work yet.</p>
          ) : (
            <table className="mt-4 w-full table-fixed text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-1/2 pb-2">Assignment</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentGrades.map((g) => {
                  const possible = Number(g.assignments?.points_possible ?? 0);
                  const pct = percent(Number(g.points_earned ?? 0), possible);
                  return (
                    <tr key={g.id}>
                      <td className="break-words py-3 pr-3 font-medium">{g.assignments?.title}</td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {formatDate(g.assignments?.due_date)}
                      </td>
                      <td className={`py-3 text-right font-medium ${gradeTone(pct)}`}>
                        {g.points_earned}/{possible} · {pct.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      <SchoolCalendar />

      {primaryRole === "parent" && (
        <p className="mt-6 text-sm text-muted-foreground">
          Guardian accounts see every child linked to their email by the school office.
        </p>
      )}
    </AppShell>
  );
}

/** Student/guardian summary: published work past its due date with nothing turned in. */
function MissingWorkCard() {
  const { students: selfStudents } = useSelfStudents();
  if (selfStudents.length === 0) return null;
  // Guardians with several children get one line per child.
  const named = selfStudents.length > 1;
  return (
    <>
      {selfStudents.map((s) => (
        <MissingWorkRow key={s.id} me={s} label={named ? `${s.first_name}: ` : ""} />
      ))}
    </>
  );
}

function MissingWorkRow({ me, label }: { me: { id: string }; label: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { previewingStudent } = useAuth();
  const { classIds: scopeIds } = useTeacherScope();
  const scopeKey = previewingStudent ? [...(scopeIds ?? [])].sort().join(",") : "";

  const { data: missingCount = 0 } = useQuery({
    queryKey: ["missing-work", me?.id, today, scopeKey],
    enabled: !!me,
    queryFn: async () => {
      const { data: enrols, error: eErr } = await supabase
        .from("enrollments")
        .select("class_id, created_at")
        .eq("student_id", me!.id);
      if (eErr) throw eErr;
      let classIds = (enrols ?? []).map((e) => e.class_id);
      if (previewingStudent) classIds = classIds.filter((id) => scopeIds?.has(id));
      if (classIds.length === 0) return 0;
      // Same rule as Gradebook, Pulse and the Assignments hub.
      const { data: due, error: aErr } = await supabase
        .from("assignments")
        .select("id, class_id, due_date, created_at, status")
        .in("class_id", classIds)
        .eq("status", "published");
      if (aErr) throw aErr;
      const list = due ?? [];
      const ids = list.map((a) => a.id);
      if (ids.length === 0) return 0;
      const [{ data: subs, error: sErr }, { data: graded, error: gErr }] = await Promise.all([
        supabase
          .from("assignment_submissions")
          .select("assignment_id")
          .eq("student_id", me!.id)
          .in("status", ["submitted", "collected", "returned"])
          .in("assignment_id", ids),
        supabase
          .from("grades")
          .select("assignment_id, points_earned, comment")
          .eq("student_id", me!.id)
          .eq("is_draft", false)
          .in("assignment_id", ids),
      ]);
      if (sErr) throw sErr;
      if (gErr) throw gErr;
      const submitted = new Set((subs ?? []).map((x) => x.assignment_id));
      for (const k of await fetchDiscussionCompletions(ids, [me!.id])) submitted.add(k.split(":")[1] ?? "");
      return list.filter((a) =>
        isMissingWork({
          assignment: a,
          grade: (graded ?? []).find((g) => g.assignment_id === a.id),
          submitted: submitted.has(a.id),
          today,
          enrolledAt: (enrols ?? []).find((e) => e.class_id === a.class_id)?.created_at ?? null,
        }),
      ).length;
    },
  });

  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <span>
        {label && <span className="font-medium">{label}</span>}
        {missingCount > 0 ? (
          <>
            <span className="font-semibold text-warning">{missingCount}</span>{" "}
            {missingCount === 1 ? "assignment is" : "assignments are"} missing.
          </>
        ) : (
          "No missing work — all caught up."
        )}
      </span>
      <Button asChild variant="outline" className="h-11">
        <Link to="/assignments">View assignments</Link>
      </Button>
    </section>
  );
}

function SetupCard() {
  const { isAdmin } = useAuth();
  const { data: adminExists, isLoading } = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return data as boolean;
    },
  });

  if (isLoading || adminExists || isAdmin) return null;

  return (
    <section className="panel mb-6 border-accent/40 p-5">
      <h2 className="text-lg font-semibold">Finish setting up your school</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        No administrator has been set up yet. Ask your school leadership to arrange
        administrator access before setting up classes, students and staff.
      </p>
    </section>
  );
}

function Stat({

  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 break-words text-xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
