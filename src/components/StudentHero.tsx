import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Flame,
  Heart,
  Shield,
  Sparkles,
  Swords,
  Target,
  Wand2,
  Skull,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, percent } from "@/lib/school";


/* ------------------------------ data types ------------------------------ */

type AssignmentRow = {
  id: string;
  title: string;
  due_date: string | null;
  points_possible: number;
  class_id: string;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  submitted_at: string;
  status: string;
};

type GradeRow = {
  id: string;
  points_earned: number | null;
  updated_at: string;
  assignment_id: string;
};

type AssessmentSubRow = {
  id: string;
  auto_score: number;
  manual_score: number;
  total_points: number;
  submitted_at: string;
  assessments: { title: string; class_id: string; time_limit_minutes: number | null } | null;
};

/* ------------------------------ hero classes ------------------------------ */

type StatKey = "strength" | "dexterity" | "vitality" | "energy";

const HERO_CLASSES = {
  barbarian: {
    name: "Barbarian",
    title: "The Homework Slayer",
    blurb: "Turns in everything. Heavy lifting is your specialty.",
    icon: Swords,
    accent: "text-destructive",
    ring: "border-destructive/40 bg-destructive/10",
  },
  rogue: {
    name: "Rogue",
    title: "The Swift Quill",
    blurb: "Finishes quizzes long before the timer runs out.",
    icon: Target,
    accent: "text-warning",
    ring: "border-warning/40 bg-warning/10",
  },
  druid: {
    name: "Druid",
    title: "The Ever-Present",
    blurb: "Never misses a day. Your stamina is legendary.",
    icon: Heart,
    accent: "text-success",
    ring: "border-success/40 bg-success/10",
  },
  sorceress: {
    name: "Sorceress",
    title: "The Arcane Scholar",
    blurb: "Tests bend to your knowledge, even on a rough week.",
    icon: Wand2,
    accent: "text-accent",
    ring: "border-accent/40 bg-accent/10",
  },
  necromancer: {
    name: "Necromancer",
    title: "The Steady Keeper",
    blurb: "Balanced across every stat — the dependable solid student.",
    icon: Skull,
    accent: "text-muted-foreground",
    ring: "border-border bg-muted/40",
  },
  paladin: {
    name: "Paladin",
    title: "The Aura of Excellence",
    blurb: "Strong in every attribute. Rare and radiant.",
    icon: Shield,
    accent: "text-primary",
    ring: "border-primary/40 bg-primary/10",
  },
} as const;

type HeroClassKey = keyof typeof HERO_CLASSES;

/** A student may swap their character class at most this many times. */
export const MAX_CLASS_CHANGES = 3;


function pickHeroClass(stats: Record<StatKey, number>): HeroClassKey {
  const values = Object.values(stats);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (min >= 85) return "paladin";
  if (max - min <= 12) return "necromancer";
  const best = (Object.keys(stats) as StatKey[]).reduce((a, b) => (stats[a] >= stats[b] ? a : b));
  if (best === "strength") return "barbarian";
  if (best === "dexterity") return "rogue";
  if (best === "vitality") return "druid";
  return "sorceress";
}

const STAT_META: Record<
  StatKey,
  { label: string; attribute: string; stroke: string; text: string; icon: typeof Swords }
> = {
  strength: {
    label: "Strength",
    attribute: "Assignment completion",
    stroke: "stroke-destructive",
    text: "text-destructive",
    icon: Swords,
  },
  dexterity: {
    label: "Dexterity",
    attribute: "Speed & response time",
    stroke: "stroke-warning",
    text: "text-warning",
    icon: Target,
  },
  vitality: {
    label: "Vitality",
    attribute: "Consistency & streak",
    stroke: "stroke-success",
    text: "text-success",
    icon: Heart,
  },
  energy: {
    label: "Energy",
    attribute: "Assessment accuracy",
    stroke: "stroke-accent",
    text: "text-accent",
    icon: Wand2,
  },
};

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

/* ------------------------------ component ------------------------------ */

export function StudentHero() {
  const today = new Date().toISOString().slice(0, 10);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);

  const { data: heroProfile, isLoading: heroProfileLoading } = useQuery({
    queryKey: ["hero-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_profiles")
        .select("hero_class, quest_started_at, class_changes")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const changesUsed = heroProfile?.class_changes ?? 0;
  const changesLeft = Math.max(0, MAX_CLASS_CHANGES - changesUsed);

  const chooseClass = useMutation({
    mutationFn: async (key: HeroClassKey) => {
      const { error } = await supabase
        .from("hero_profiles")
        .upsert({ user_id: user!.id, hero_class: key }, { onConflict: "user_id" });
      if (error) throw error;
      return key;
    },
    onSuccess: (key) => {
      setPicking(false);
      toast.success(`Your quest begins as a ${HERO_CLASSES[key].name}!`);
      queryClient.invalidateQueries({ queryKey: ["hero-profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });



  const { data: classes = [] } = useQuery({
    queryKey: ["hero-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, subject");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["hero-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, due_date, points_possible, class_id");
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["hero-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, submitted_at, status")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["hero-grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, points_earned, updated_at, assignment_id")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GradeRow[];
    },
  });

  const { data: assessmentSubs = [] } = useQuery({
    queryKey: ["hero-assessment-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_submissions")
        .select(
          "id, auto_score, manual_score, total_points, submitted_at, assessments(title, class_id, time_limit_minutes)",
        )
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssessmentSubRow[];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["hero-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("date, status")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const classNameById = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name as string])),
    [classes],
  );

  /* ---------- streak (vitality source) ---------- */
  const streak = useMemo(() => {
    const active = new Set<string>();
    submissions.forEach((s) => active.add(dayKey(s.submitted_at)));
    assessmentSubs.forEach((s) => active.add(dayKey(s.submitted_at)));
    attendance.forEach((a) => {
      if (a.status === "present" || a.status === "tardy") active.add(a.date);
    });
    active.add(today);

    let current = 0;
    const cursor = new Date(`${today}T00:00:00`);
    while (active.has(cursor.toISOString().slice(0, 10))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const sorted = [...active].sort();
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    sorted.forEach((k) => {
      const d = new Date(`${k}T00:00:00`);
      if (prev && (d.getTime() - prev.getTime()) / 86400000 === 1) run += 1;
      else run = 1;
      longest = Math.max(longest, run);
      prev = d;
    });

    return { current, longest, days: active };
  }, [submissions, assessmentSubs, attendance, today]);

  /* ---------- stats ---------- */
  const submissionByAssignment = useMemo(
    () => new Map(submissions.map((s) => [s.assignment_id, s])),
    [submissions],
  );

  const missing = useMemo(() => {
    return assignments.filter(
      (a) => a.due_date && a.due_date < today && !submissionByAssignment.has(a.id),
    );
  }, [assignments, submissionByAssignment, today]);

  const stats = useMemo<Record<StatKey, number>>(() => {
    const due = assignments.filter((a) => !a.due_date || a.due_date <= today);
    const onTime = due.filter((a) => {
      const s = submissionByAssignment.get(a.id);
      if (!s) return false;
      return !a.due_date || dayKey(s.submitted_at) <= a.due_date;
    });
    const strength = due.length ? percent(onTime.length, due.length) : 0;

    const timed = assignments
      .map((a) => {
        const s = submissionByAssignment.get(a.id);
        if (!s || !a.due_date) return null;
        const lead =
          (new Date(`${a.due_date}T23:59:59`).getTime() - new Date(s.submitted_at).getTime()) /
          86400000;
        return lead;
      })
      .filter((v): v is number => v != null);
    const avgLead = timed.length ? timed.reduce((s, v) => s + v, 0) / timed.length : 0;
    const dexterity = timed.length
      ? Math.max(0, Math.min(100, 50 + (avgLead / 3) * 50))
      : 0;

    const vitality = Math.max(
      0,
      Math.min(100, (Math.max(streak.current, streak.longest) / 30) * 100),
    );

    const scored = assessmentSubs.filter((s) => Number(s.total_points) > 0);
    const energyFromAssessments = scored.length
      ? scored.reduce(
          (sum, s) =>
            sum +
            percent(Number(s.auto_score) + Number(s.manual_score), Number(s.total_points)),
          0,
        ) / scored.length
      : null;

    const gradedAssignments = grades
      .map((g) => {
        const a = assignments.find((x) => x.id === g.assignment_id);
        if (!a || g.points_earned == null || !Number(a.points_possible)) return null;
        return percent(Number(g.points_earned), Number(a.points_possible));
      })
      .filter((v): v is number => v != null);
    const energyFromGrades = gradedAssignments.length
      ? gradedAssignments.reduce((s, v) => s + v, 0) / gradedAssignments.length
      : 0;

    const energy = Math.min(100, energyFromAssessments ?? energyFromGrades);

    return {
      strength: Math.round(strength),
      dexterity: Math.round(dexterity),
      vitality: Math.round(vitality),
      energy: Math.round(energy),
    };
  }, [assignments, submissionByAssignment, streak, assessmentSubs, grades, today]);

  const suggestedKey = pickHeroClass(stats);
  const chosenKey = (heroProfile?.hero_class ?? null) as HeroClassKey | null;
  const heroKey = chosenKey ?? suggestedKey;
  const hero = HERO_CLASSES[heroKey];


  /* ---------- XP + level ---------- */
  const xp = useMemo(() => {
    const fromGrades = grades.reduce(
      (s, g) => s + Math.round(Number(g.points_earned ?? 0) * 10),
      0,
    );
    const fromWork = submissions.length * 50;
    const fromTests = assessmentSubs.length * 100;
    const fromStreak = streak.longest * 25;
    const total = fromGrades + fromWork + fromTests + fromStreak;
    return {
      total,
      level: Math.max(1, Math.floor(total / 1000) + 1),
      intoLevel: total % 1000,
    };
  }, [grades, submissions, assessmentSubs, streak.longest]);

  /* ---------- loot log ---------- */
  const loot = useMemo(() => {
    const items: { id: string; text: string; tone: string }[] = [];

    assessmentSubs.slice(0, 5).forEach((s) => {
      const pts = Number(s.auto_score) + Number(s.manual_score);
      items.push({
        id: `assess-${s.id}`,
        text: `⚔️ You defeated "${s.assessments?.title ?? "an assessment"}"! Dropped ${Math.max(
          100,
          Math.round(pts * 10),
        )} XP.`,
        tone: "text-accent",
      });
    });

    submissions.slice(0, 5).forEach((s) => {
      const a = assignments.find((x) => x.id === s.assignment_id);
      items.push({
        id: `sub-${s.id}`,
        text: `🗡️ Quest complete: ${a?.title ?? "Assignment"} handed in. +50 XP.`,
        tone: "text-success",
      });
    });

    if (streak.current >= 2)
      items.push({
        id: "streak",
        text: `🛡️ You maintained your ${streak.current}-day streak! Vitality +10.`,
        tone: "text-warning",
      });

    missing.slice(0, 4).forEach((a) =>
      items.push({
        id: `miss-${a.id}`,
        text: `📜 ${a.title} in ${classNameById.get(a.class_id) ?? "class"} is overdue — hand it in to clear your quest log.`,
        tone: "text-muted-foreground",
      }),
    );

    return items.slice(0, 12);
  }, [assessmentSubs, submissions, assignments, streak.current, missing, classNameById]);

  /* ---------- dungeon (class) board ---------- */
  const dungeons = useMemo(() => {
    return classes
      .map((c) => {
        const classAssignments = assignments.filter((a) => a.class_id === c.id);
        const ids = new Set(classAssignments.map((a) => a.id));
        const done = submissions.filter((s) => ids.has(s.assignment_id)).length;
        const rows = grades.filter((g) => ids.has(g.assignment_id) && g.points_earned != null);
        const earned = rows.reduce((s, g) => s + Number(g.points_earned ?? 0), 0);
        const possible = rows.reduce((s, g) => {
          const a = classAssignments.find((x) => x.id === g.assignment_id);
          return s + Number(a?.points_possible ?? 0);
        }, 0);
        const power = possible ? Math.round(percent(earned, possible)) : 0;
        const open = classAssignments.filter(
          (a) => !submissions.some((s) => s.assignment_id === a.id),
        ).length;
        return { id: c.id, name: c.name as string, done, power, open };
      })
      .sort((a, b) => b.power - a.power)
      .slice(0, 5);
  }, [classes, assignments, submissions, grades]);

  const statHints: Record<StatKey, string> = {
    strength: missing.length
      ? `You are missing ${missing.length} assignment${missing.length === 1 ? "" : "s"} in ${
          classNameById.get(missing[0]!.class_id) ?? "one of your classes"
        }. Head to the Dungeon (classroom) to slay them.`
      : "No overdue quests — your pack is clean. Keep handing work in on time.",
    dexterity:
      stats.dexterity >= 60
        ? "You submit ahead of the deadline. Haste is active."
        : "Submit a day or two earlier to sharpen your reflexes.",
    vitality: `Longest streak: ${streak.longest} day${streak.longest === 1 ? "" : "s"} · current: ${streak.current}. Log in daily to keep your HP full.`,
    energy:
      stats.energy >= 85
        ? "Your test accuracy is arcane-level. Keep casting."
        : "Review feedback on quizzes to raise your Energy pool.",
  };

  const HeroIcon = hero.icon;

  if (heroProfileLoading) return null;

  if (!chosenKey || picking) {
    return (
      <ClassChooser
        suggested={suggestedKey}
        current={chosenKey}
        changesLeft={changesLeft}
        saving={chooseClass.isPending}
        onChoose={(key) => chooseClass.mutate(key)}
        {...(chosenKey ? { onCancel: () => setPicking(false) } : {})}
      />
    );

  }

  return (

    <TooltipProvider delayDuration={120}>
      <section className="mt-6 space-y-6">
        {/* Hero profile */}
        <div className={`panel overflow-hidden border p-5 ${hero.ring}`}>
          <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="flex items-center gap-4">
              <div
                className={`grid size-24 place-items-center rounded-2xl border-2 border-current/30 bg-background/70 ${hero.accent}`}
              >
                <HeroIcon className="size-12" />
              </div>
              <div className="md:hidden">
                <p className="text-lg font-semibold">
                  Level {xp.level} {hero.name}
                </p>
                <p className="text-sm text-muted-foreground">“{hero.title}”</p>
              </div>
            </div>

            <div className="hidden md:block">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Hero profile
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Level {xp.level} {hero.name}
                <span className="text-muted-foreground"> — “{hero.title}”</span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{hero.blurb}</p>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  Quest began {formatDate(heroProfile?.quest_started_at)}
                </p>
                {changesLeft > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Change class ({changesLeft} left)
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No class changes left — this is your hero for the year.
                  </span>
                )}
              </div>
            </div>



            <div className="w-full md:w-64">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>XP</span>
                <span>{xp.total.toLocaleString()} total</span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full border border-border bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out"
                  style={{ width: `${(xp.intoLevel / 1000) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {1000 - xp.intoLevel} XP to level {xp.level + 1}
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                <Flame
                  className={`size-5 ${streak.current > 1 ? "text-warning animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" : "text-muted-foreground"}`}
                />
                <p className="text-sm">
                  <span className="font-semibold">{streak.current}</span> day streak
                  <span className="text-muted-foreground"> · best {streak.longest}</span>
                </p>
              </div>
            </div>
        </div>
        </div>

        {/* Stat orbs */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold">Attributes</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Hover an orb to see how to raise it.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {(Object.keys(STAT_META) as StatKey[]).map((key, i) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-center rounded-xl p-2 text-center transition-transform duration-200 hover:scale-105"
                  >
                    <StatOrb value={stats[key]} stat={key} delay={i * 140} />
                    <p className={`mt-2 text-sm font-semibold ${STAT_META[key].text}`}>
                      {STAT_META[key].label}
                    </p>
                    <p className="text-xs text-muted-foreground">{STAT_META[key].attribute}</p>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{statHints[key]}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Loot log */}
          <div className="panel p-5">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <ScrollText className="size-4 text-accent" /> Loot log
            </h3>
            {loot.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No drops yet — complete a quest to start your log.
              </p>
            ) : (
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {loot.map((l, i) => (
                  <li
                    key={l.id}
                    className="animate-fade-in rounded-lg border border-border bg-muted/30 p-3 text-sm"
                    style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                  >
                    <span className={l.tone}>{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Party / dungeon board */}
          <div className="panel p-5">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Shield className="size-4 text-accent" /> Party board — your dungeons
            </h3>
            {dungeons.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Join a class to unlock your first dungeon.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {dungeons.map((d, i) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <span className="text-muted-foreground">Rank {i + 1} · </span>
                        {d.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.done} quests cleared
                        {d.open > 0 ? ` · ${d.open} still open` : " · dungeon cleared"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${
                        d.power >= 85
                          ? "border-success/40 bg-success/10 text-success"
                          : d.power >= 70
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      Power {d.power}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Party ranks are private: you only ever see your own hero stats.
            </p>
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}

/* ------------------------------ stat orb ------------------------------ */

const ORB = 108;
const R = 45;
const C = 2 * Math.PI * R;

function StatOrb({ value, stat, delay }: { value: number; stat: StatKey; delay: number }) {
  const [shown, setShown] = useState(0);
  const meta = STAT_META[stat];

  useEffect(() => {
    const t = setTimeout(() => setShown(Math.max(0, Math.min(100, value))), 80 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return (
    <svg width={ORB} height={ORB} viewBox={`0 0 ${ORB} ${ORB}`} aria-hidden>
      <circle cx={ORB / 2} cy={ORB / 2} r={R} className="stroke-muted" strokeWidth={10} fill="none" />
      <circle
        cx={ORB / 2}
        cy={ORB / 2}
        r={R}
        className={meta.stroke}
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={C}
        strokeDashoffset={C - (C * shown) / 100}
        transform={`rotate(-90 ${ORB / 2} ${ORB / 2})`}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        className={`fill-current text-xl font-semibold ${meta.text}`}
      >
        {Math.round(value)}
      </text>
    </svg>
  );
}

/* ------------------------------ class chooser ------------------------------ */

function ClassChooser({
  suggested,
  current,
  changesLeft,
  saving,
  onChoose,
  onCancel,
}: {
  suggested: HeroClassKey;
  current: HeroClassKey | null;
  changesLeft: number;
  saving: boolean;
  onChoose: (key: HeroClassKey) => void;
  onCancel?: () => void;
}) {

  const [selected, setSelected] = useState<HeroClassKey>(current ?? suggested);
  const keys = Object.keys(HERO_CLASSES) as HeroClassKey[];

  return (
    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Character creation
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {current ? "Change your character class" : "Choose your character class"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Your class gives you a hero title and shapes the way your attributes level up.
            Based on your work so far we would suggest
            the <span className="font-medium text-foreground">{HERO_CLASSES[suggested].name}</span>,
            but the choice is yours.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          const hero = HERO_CLASSES[key];
          const Icon = hero.icon;
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={active}
              className={`rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.02] ${
                active ? `${hero.ring} ring-2 ring-accent` : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid size-11 place-items-center rounded-lg border border-current/30 bg-background/70 ${hero.accent}`}
                >
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{hero.name}</p>
                  <p className="truncate text-xs text-muted-foreground">“{hero.title}”</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{hero.blurb}</p>
              {key === suggested && (
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Suggested for you
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => onChoose(selected)}
          disabled={saving || (!!current && changesLeft === 0)}
        >
          {saving
            ? "Starting your quest…"
            : current
              ? `Become a ${HERO_CLASSES[selected].name}`
              : `Begin the year as a ${HERO_CLASSES[selected].name}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {current
            ? changesLeft > 0
              ? `You have ${changesLeft} of ${MAX_CLASS_CHANGES} class changes left — choose carefully.`
              : "You have used all 3 class changes, so your class is now locked in."
            : `Choose carefully — after this you may change your class only ${MAX_CLASS_CHANGES} times.`}
        </p>
      </div>

    </section>
  );
}
