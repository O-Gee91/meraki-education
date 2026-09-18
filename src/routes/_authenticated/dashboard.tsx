import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, Megaphone, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SchoolCalendar } from "@/components/SchoolCalendar";
import { HeroProfilePanel } from "@/components/HeroProfilePanel";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherScope } from "@/hooks/useTeacherScope";

import { supabase } from "@/integrations/supabase/client";
import { formatDate, letterGrade, gradeTone, percent } from "@/lib/school";

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
  const { isStaff, primaryRole, profile } = useAuth();
  const { classIds, studentIds } = useTeacherScope();
  const today = new Date().toISOString().slice(0, 10);

  const { data: allClasses = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term")
        .order("period");
      if (error) throw error;
      return data;
    },
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students"],
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
    queryKey: ["announcements"],
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
    queryKey: ["my-grades"],
    enabled: !isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, points_earned, assignments(title, points_possible, due_date, class_id)")
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["my-attendance"],
    enabled: !isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, status")
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: upcomingEventsRaw = [] } = useQuery({
    queryKey: ["staff-upcoming-events", today],
    enabled: isStaff,
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
    queryKey: ["upcoming-assignments", today],
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
    queryKey: ["upcoming-assessments", today],
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
    ...upcomingAssessments.map((a) => ({
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


  const graded = grades.filter((g) => g.points_earned != null && g.assignments);
  const totalEarned = graded.reduce((sum, g) => sum + Number(g.points_earned ?? 0), 0);
  const totalPossible = graded.reduce(
    (sum, g) => sum + Number(g.assignments?.points_possible ?? 0),
    0,
  );
  const overall = percent(totalEarned, totalPossible);

  return (
    <AppShell
      title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
      description={
        isStaff
          ? "Your classes, roster and school announcements."
          : "Your grades, upcoming work and news from your teachers."
      }
    >
      <SetupCard />

      {!isStaff && <HeroProfilePanel />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <Stat icon={BookOpen} label="Classes" value={String(classes.length)} />
        {isStaff ? (
          <Stat icon={Users} label="Students" value={String(students.length)} />
        ) : (
          <Stat
            icon={CalendarCheck}
            label="Overall grade"
            value={totalPossible ? `${overall.toFixed(1)}% ${letterGrade(overall)}` : "—"}
            tone={totalPossible ? gradeTone(overall) : undefined}
          />
        )}
        <Stat
          icon={Megaphone}
          label="Announcements"
          value={String(announcements.length)}
        />
        <Stat
          icon={CalendarCheck}
          label={isStaff ? "Term" : "Recent attendance"}
          value={isStaff ? (classes[0]?.term ?? "—") : `${attendance.length} days logged`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
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
                  className="flex items-center justify-between py-3 text-sm hover:text-accent"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.subject ?? "—"} · Period {c.period ?? "—"} · {c.room ?? "no room"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-semibold">Announcements</h2>
          <div className="mt-4 space-y-4">
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
            ) : (
              announcements.map((a) => (
                <article key={a.id}>
                  <h3 className="text-sm font-semibold">{a.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
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

      <section className="panel mt-6 p-5">
        <div className="flex items-center justify-between">
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
                    className="text-sm font-medium hover:text-accent"
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


      <SchoolCalendar />


      {!isStaff && (
        <section className="panel mt-6 p-5">
          <h2 className="text-lg font-semibold">Recent scores</h2>
          {graded.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No graded work yet.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2">Assignment</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {graded.map((g) => {
                  const possible = Number(g.assignments?.points_possible ?? 0);
                  const pct = percent(Number(g.points_earned ?? 0), possible);
                  return (
                    <tr key={g.id}>
                      <td className="py-2 font-medium">{g.assignments?.title}</td>
                      <td className="py-2 text-muted-foreground">
                        {formatDate(g.assignments?.due_date)}
                      </td>
                      <td className={`py-2 text-right font-semibold ${gradeTone(pct)}`}>
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

      {primaryRole === "parent" && (
        <p className="mt-6 text-sm text-muted-foreground">
          Guardian accounts see every child linked to their email by the school office.
        </p>
      )}
    </AppShell>
  );
}

function SetupCard() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: adminExists, isLoading } = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return data as boolean;
    },
  });

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: (ok) => {
      if (!ok) {
        toast.error("This school already has an administrator.");
      } else {
        toast.success("You are now the school administrator.");
      }
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || adminExists || isAdmin) return null;

  return (
    <section className="panel mb-6 border-accent/40 p-5">
      <h2 className="text-lg font-semibold">Finish setting up your school</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        No administrator has been set up yet. Claim administrator access to create classes, add
        students and staff, and grant teaching permissions. Only the first person can do this.
      </p>
      <Button className="mt-4" onClick={() => claim.mutate()} disabled={claim.isPending}>
        {claim.isPending ? "Setting up…" : "Claim administrator access"}
      </Button>
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
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
