import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Flame, Sparkles, Star, Trophy, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { letterGrade, percent, formatDate } from "@/lib/school";

type GradeRow = {
  id: string;
  points_earned: number | null;
  updated_at: string;
  assignments: {
    title: string;
    points_possible: number;
    due_date: string | null;
    class_id: string;
  } | null;
};

type SubmissionRow = {
  id: string;
  submitted_at: string;
  status: string;
  assignments: { title: string; due_date: string | null } | null;
};

const RING_SIZE = 104;
const RADIUS = 44;
const CIRC = 2 * Math.PI * RADIUS;

function toneFor(pct: number) {
  if (pct >= 85) return { stroke: "stroke-success", text: "text-success" };
  if (pct >= 70) return { stroke: "stroke-warning", text: "text-warning" };
  return { stroke: "stroke-destructive", text: "text-destructive" };
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function StudentQuest() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: classes = [] } = useQuery({
    queryKey: ["quest-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, subject");
      if (error) throw error;
      return data;
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["quest-grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, points_earned, updated_at, assignments(title, points_possible, due_date, class_id)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GradeRow[];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["quest-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("id, submitted_at, status, assignments(title, due_date)")
        .order("submitted_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["quest-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("date, status")
        .order("date", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rings = useMemo(() => {
    return classes
      .map((c) => {
        const rows = grades.filter(
          (g) => g.assignments?.class_id === c.id && g.points_earned != null,
        );
        const earned = rows.reduce((s, g) => s + Number(g.points_earned ?? 0), 0);
        const possible = rows.reduce((s, g) => s + Number(g.assignments?.points_possible ?? 0), 0);
        return {
          id: c.id,
          name: c.name,
          subject: c.subject,
          count: rows.length,
          pct: possible ? percent(earned, possible) : 0,
          scored: !!possible,
        };
      })
      .filter((r) => r.scored);
  }, [classes, grades]);

  const xp = useMemo(() => {
    const fromGrades = grades.reduce((s, g) => s + Math.round(Number(g.points_earned ?? 0) * 10), 0);
    const fromWork = submissions.length * 50;
    const total = fromGrades + fromWork;
    const level = Math.max(1, Math.floor(total / 1000) + 1);
    const intoLevel = total % 1000;
    return { total, level, intoLevel };
  }, [grades, submissions]);

  const streak = useMemo(() => {
    const active = new Set<string>();
    submissions.forEach((s) => active.add(dayKey(s.submitted_at)));
    attendance.forEach((a) => {
      if (a.status === "present" || a.status === "tardy") active.add(a.date);
    });
    active.add(today);
    let count = 0;
    const cursor = new Date(`${today}T00:00:00`);
    while (active.has(cursor.toISOString().slice(0, 10))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { count, days: active };
  }, [submissions, attendance, today]);

  const achievements = useMemo(() => {
    const items: { id: string; title: string; detail: string; when: string; icon: "star" | "zap" | "trophy" | "check" }[] = [];

    items.push({
      id: "login",
      title: "First login of the day",
      detail: "Showing up is half the win.",
      when: today,
      icon: "zap",
    });

    if (streak.count >= 3)
      items.push({
        id: `streak-${streak.count}`,
        title: `${streak.count}-day streak`,
        detail: "Keep the flame alive by checking in tomorrow.",
        when: today,
        icon: "trophy",
      });

    grades
      .filter((g) => g.points_earned != null && g.assignments)
      .slice(0, 12)
      .forEach((g) => {
        const possible = Number(g.assignments?.points_possible ?? 0);
        const pct = percent(Number(g.points_earned ?? 0), possible);
        if (possible && pct >= 100)
          items.push({
            id: `perfect-${g.id}`,
            title: "Perfect score",
            detail: `${g.assignments?.title} — ${pct.toFixed(0)}%`,
            when: g.updated_at,
            icon: "star",
          });
        else if (possible && pct >= 90)
          items.push({
            id: `great-${g.id}`,
            title: "Top marks",
            detail: `${g.assignments?.title} — ${pct.toFixed(0)}% (${letterGrade(pct)})`,
            when: g.updated_at,
            icon: "star",
          });
      });

    const early = submissions.filter(
      (s) => s.assignments?.due_date && dayKey(s.submitted_at) < s.assignments.due_date,
    );
    if (early.length >= 5)
      items.push({
        id: "early-5",
        title: "Submitted 5 assignments early",
        detail: "Ahead of the deadline, every time.",
        when: early[0]?.submitted_at ?? today,
        icon: "trophy",
      });
    early.slice(0, 4).forEach((s) =>
      items.push({
        id: `early-${s.id}`,
        title: "Beat the deadline",
        detail: `${s.assignments?.title ?? "Assignment"} handed in early`,
        when: s.submitted_at,
        icon: "check",
      }),
    );

    submissions.slice(0, 6).forEach((s) =>
      items.push({
        id: `sub-${s.id}`,
        title: "Work handed in",
        detail: s.assignments?.title ?? "Assignment",
        when: s.submitted_at,
        icon: "check",
      }),
    );

    const seen = new Set<string>();
    return items
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 14);
  }, [grades, submissions, streak.count, today]);

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return {
        key,
        label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
        active: streak.days.has(key),
      };
    });
  }, [streak.days, today]);

  return (
    <section className="mt-6 space-y-6">
      <div className="panel overflow-hidden p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4 text-accent" /> Your quest log
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Progress rings, streaks and wins from your own work.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
              <Flame
                className={`size-7 ${streak.count > 1 ? "text-warning animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" : "text-muted-foreground"}`}
              />
              <div>
                <p className="text-2xl font-semibold leading-none">{streak.count}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">day streak</p>
              </div>
            </div>
            <div className="rounded-xl border border-border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Level</p>
              <p className="text-2xl font-semibold leading-none">{xp.level}</p>
              <p className="mt-1 text-xs text-muted-foreground">{xp.total.toLocaleString()} XP</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out"
              style={{ width: `${(xp.intoLevel / 1000) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {1000 - xp.intoLevel} XP to level {xp.level + 1}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {last7.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-8 w-full rounded-md border ${d.active ? "border-warning/50 bg-warning/30" : "border-border bg-muted/40"}`}
                title={d.key}
              />
              <span className="text-[10px] uppercase text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Zap className="size-4 text-accent" /> XP progress rings
          </h3>
          {rings.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No scored work yet — your rings fill up as soon as grades come in.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
              {rings.map((r, i) => (
                <ProgressRing
                  key={r.id}
                  label={r.name}
                  sub={`${r.count} graded`}
                  pct={r.pct}
                  delay={i * 120}
                />
              ))}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Award className="size-4 text-accent" /> Achievements unlocked
          </h3>
          {achievements.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Hand in your first assignment to unlock a badge.
            </p>
          ) : (
            <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
              {achievements.map((a, i) => (
                <li
                  key={a.id}
                  className="animate-fade-in flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                >
                  <span className="mt-0.5 shrink-0 text-accent">
                    {a.icon === "star" ? (
                      <Star className="size-4" />
                    ) : a.icon === "trophy" ? (
                      <Trophy className="size-4" />
                    ) : a.icon === "zap" ? (
                      <Zap className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(a.when)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ProgressRing({
  label,
  sub,
  pct,
  delay,
}: {
  label: string;
  sub: string;
  pct: number;
  delay: number;
}) {
  const [shown, setShown] = useState(0);
  const tone = toneFor(pct);

  useEffect(() => {
    const t = setTimeout(() => setShown(Math.min(100, Math.max(0, pct))), 80 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div className="flex flex-col items-center text-center">
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          className="stroke-muted"
          strokeWidth={9}
          fill="none"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          className={tone.stroke}
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - (CIRC * shown) / 100}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          dominantBaseline="middle"
          className={`fill-current text-lg font-semibold ${tone.text}`}
        >
          {pct.toFixed(0)}%
        </text>
        <text
          x="50%"
          y="64%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[10px] text-muted-foreground"
        >
          {letterGrade(pct)}
        </text>
      </svg>
      <p className="mt-2 line-clamp-1 text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
