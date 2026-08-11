import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, Megaphone, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, letterGrade, gradeTone, percent } from "@/lib/school";


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

  const { data: classes = [] } = useQuery({
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

  const { data: students = [] } = useQuery({
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
          : "Grades, attendance and announcements for the current term."
      }
    >
      <SetupCard />

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
        </section>
      </div>

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
