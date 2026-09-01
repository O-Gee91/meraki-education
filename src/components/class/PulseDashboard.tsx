import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Moon, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { studentLabel } from "@/lib/student-display";
import { letterFor, type GradingSetup } from "@/lib/grading";

type RosterRow = {
  id: string;
  student_id: string;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: number;
    student_number: string | null;
  } | null;
};

type AssignmentRow = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
};

type GradeRow = {
  assignment_id: string;
  student_id: string;
  points_earned: number | null;
};

type Status = "green" | "yellow" | "red" | "none";

const STATUS_META: Record<Status, { label: string; dot: string; ring: string; text: string }> = {
  green: {
    label: "On track",
    dot: "bg-success",
    ring: "border-success/40 bg-success/10",
    text: "text-success",
  },
  yellow: {
    label: "Slowing down",
    dot: "bg-warning",
    ring: "border-warning/50 bg-warning/10",
    text: "text-warning-foreground",
  },
  red: {
    label: "At risk",
    dot: "bg-destructive",
    ring: "border-destructive/50 bg-destructive/10",
    text: "text-destructive",
  },
  none: {
    label: "No data yet",
    dot: "bg-muted-foreground/50",
    ring: "border-border bg-muted/40",
    text: "text-muted-foreground",
  },
};

function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function averageTone(pct: number | null) {
  if (pct == null) return "bg-muted";
  if (pct >= 80) return "bg-success";
  if (pct >= 70) return "bg-warning";
  return "bg-destructive";
}

export function PulseDashboard({
  classId,
  className,
  roster,
  assignments,
  grades,
  setup,
  isStaff,
  useIds,
  studentAverage,
}: {
  classId: string;
  className: string;
  roster: RosterRow[];
  assignments: AssignmentRow[];
  grades: GradeRow[];
  setup: GradingSetup;
  isStaff: boolean;
  useIds: boolean;
  studentAverage: (studentId: string) => number | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const { data: links = [] } = useQuery({
    queryKey: ["pulse-student-links", classId, roster.length],
    enabled: isStaff && roster.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, user_id, guardian_user_id")
        .in(
          "id",
          roster.map((r) => r.student_id),
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignmentIds = assignments.map((a) => a.id);
  const { data: submissions = [] } = useQuery({
    queryKey: ["pulse-submission-times", classId, assignmentIds.length],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("id, submitted_at, assignment_id, student_id")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cards = useMemo(() => {
    const dueSoFar = assignments.filter((a) => !a.due_date || a.due_date <= todayKey);
    return roster.map((r) => {
      const avg = studentAverage(r.student_id);
      const missing = dueSoFar.filter((a) => {
        const g = grades.find(
          (x) => x.student_id === r.student_id && x.assignment_id === a.id,
        );
        return g?.points_earned == null;
      }).length;

      let status: Status = "none";
      if (avg != null || dueSoFar.length > 0) {
        const risky = (avg != null && avg < 70) || missing >= 3;
        const slipping = (avg != null && avg < 80) || missing >= 1;
        status = risky ? "red" : slipping ? "yellow" : "green";
      }
      return { row: r, avg, missing, status };
    });
  }, [assignments, grades, roster, studentAverage, todayKey]);

  const counts = cards.reduce<Record<Status, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { green: 0, yellow: 0, red: 0, none: 0 },
  );

  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const due = assignments.filter((a) => a.due_date === key);
      const dueCount = due.length * Math.max(roster.length, 1);
      const scored = due.flatMap((a) =>
        grades
          .filter((g) => g.assignment_id === a.id && g.points_earned != null)
          .map((g) => (Number(g.points_earned) / Number(a.points_possible || 1)) * 100),
      );
      const avg = scored.length
        ? scored.reduce((s, v) => s + v, 0) / scored.length
        : null;
      return {
        key,
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        day: d.getDate(),
        items: due.length,
        dueCount,
        avg,
      };
    });
  }, [assignments, grades, roster.length, today]);

  const maxDue = Math.max(1, ...week.map((w) => w.dueCount));

  const hours = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    for (const s of submissions) {
      if (!s.submitted_at) continue;
      const h = new Date(s.submitted_at).getHours();
      buckets[h] = (buckets[h] ?? 0) + 1;

    }
    return buckets;
  }, [submissions]);

  const maxHour = Math.max(1, ...hours);
  const lateNight = hours.slice(0, 5).reduce((a, b) => a + b, 0);
  const totalSubs = hours.reduce((a, b) => a + b, 0);

  const selectedCard = cards.find((c) => c.row.student_id === selected) ?? null;

  const checkIn = useMutation({
    mutationFn: async (studentId: string) => {
      const link = links.find((l) => l.id === studentId);
      const recipients = [link?.user_id, link?.guardian_user_id].filter(
        (v): v is string => !!v,
      );
      if (recipients.length === 0) {
        throw new Error("This student has no linked account yet.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const sender = auth.user?.id;
      if (!sender) throw new Error("You must be signed in.");
      const card = cards.find((c) => c.row.student_id === studentId);
      const name = card?.row.students
        ? `${card.row.students.first_name} ${card.row.students.last_name}`
        : "your student";
      const body = `Hi — I'd like to check in about ${className}. ${name}'s current average is ${
        card?.avg == null ? "not yet available" : `${card.avg.toFixed(1)}%`
      }${card?.missing ? ` with ${card.missing} missing item(s)` : ""}. Let's find a time to talk about next steps and support.`;
      const { error } = await supabase.from("messages").insert(
        recipients.map((recipient_id) => ({
          sender_id: sender,
          recipient_id,
          subject: `Check-in — ${className}`,
          body,
        })),
      );
      if (error) throw error;
      return recipients.length;
    },
    onSuccess: (n) => toast.success(`Check-in sent to ${n} recipient${n === 1 ? "" : "s"}.`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (roster.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4 text-accent" />
              Pulse
            </h2>
            <p className="text-sm text-muted-foreground">
              Traffic-light view of the class. Tap a student for their standing and a one-click
              check-in.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(["green", "yellow", "red", "none"] as Status[]).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1"
              >
                <span className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
                <strong>{counts[s]}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {cards.map(({ row, avg, missing, status }) => {
            const meta = STATUS_META[status];
            const active = selected === row.student_id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(active ? null : row.student_id)}
                className={`group flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-md ${meta.ring} ${
                  active ? "ring-2 ring-accent" : ""
                }`}
                title={`${meta.label}${avg == null ? "" : ` · ${avg.toFixed(1)}%`}`}
              >
                <span className="relative">
                  <span className="flex size-11 items-center justify-center rounded-full bg-card text-sm font-semibold shadow-sm">
                    {useIds
                      ? (row.students?.student_number ?? "—").slice(-3)
                      : initials(row.students?.first_name, row.students?.last_name)}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card ${meta.dot}`}
                  />
                </span>
                <span className="w-full truncate text-xs font-medium">
                  {studentLabel(row.students, useIds)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {avg == null ? "—" : `${avg.toFixed(0)}%`}
                  {missing > 0 ? ` · ${missing} missing` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {selectedCard && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <p className="text-sm font-semibold">
                {studentLabel(selectedCard.row.students, useIds)}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUS_META[selectedCard.status].label} ·{" "}
                {selectedCard.avg == null
                  ? "no graded work yet"
                  : `${selectedCard.avg.toFixed(1)}% ${letterFor(selectedCard.avg, setup.scale)}`}
                {selectedCard.missing > 0 ? ` · ${selectedCard.missing} missing item(s)` : ""}
              </p>
            </div>
            {isStaff && (
              <Button
                size="sm"
                onClick={() => checkIn.mutate(selectedCard.row.student_id)}
                disabled={checkIn.isPending}
              >
                <Send className="mr-2 size-4" />
                {checkIn.isPending ? "Sending…" : "Send check-in"}
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="size-4" /> Next 7 days
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Circle size = submissions due · color = class average on that work.
          </p>
          <div className="mt-5 grid grid-cols-7 gap-2">
            {week.map((d) => {
              const scale = 28 + Math.round((d.dueCount / maxDue) * 34);
              return (
                <div key={d.key} className="flex flex-col items-center gap-2">
                  <div className="flex h-16 items-center justify-center">
                    {d.items === 0 ? (
                      <span className="size-2 rounded-full bg-border" />
                    ) : (
                      <span
                        className={`flex items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground ${averageTone(d.avg)}`}
                        style={{ width: scale, height: scale }}
                        title={`${d.items} item(s) · ${d.dueCount} submissions due${
                          d.avg == null ? "" : ` · avg ${d.avg.toFixed(0)}%`
                        }`}
                      >
                        {d.items}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium">{d.label}</span>
                  <span className="text-[11px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Moon className="size-4" /> Work-hour pulse
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            When students actually submit. Late-night spikes usually mean stress or procrastination.
          </p>
          {totalSubs === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No online submissions yet — this fills in as students turn work in.
            </p>
          ) : (
            <>
              <div className="mt-5 flex h-28 items-end gap-[3px]">
                {hours.map((count, hour) => (
                  <div
                    key={hour}
                    className="flex-1"
                    title={`${hour}:00 — ${count} submission${count === 1 ? "" : "s"}`}
                  >
                    <div
                      className={`w-full rounded-t ${
                        hour < 5 ? "bg-destructive/70" : hour < 8 ? "bg-warning" : "bg-accent"
                      }`}
                      style={{ height: `${Math.max(count ? 6 : 2, (count / maxHour) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>12a</span>
                <span>6a</span>
                <span>12p</span>
                <span>6p</span>
                <span>11p</span>
              </div>
              {lateNight > 0 && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {lateNight} submission{lateNight === 1 ? "" : "s"} arrived between midnight and
                  5am — consider adjusting deadlines or checking in on workload.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
