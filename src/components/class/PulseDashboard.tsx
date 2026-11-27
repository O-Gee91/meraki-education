import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, ChevronDown, ClipboardList, HeartPulse, MessageSquareText, Send, Sparkles, X } from "lucide-react";
import { useWellbeingFeed } from "@/hooks/useWellbeingFeed";

type Signal = "attendance" | "missing" | "behavior" | "wellbeing";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, fetchByIds, fetchChunks, mergeChunkTops } from "@/lib/query";
import { READ_REUSE_MS } from "@/lib/api-query-policy";
import {
  attentionFailureLabel,
  presentCount,
  pulseReadPlan,
  readState,
  teacherTodayDetail,
  type ReadState,
} from "@/lib/class-pulse";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/LoadError";
import { studentLabel } from "@/lib/student-display";
import { letterFor, type GradingSetup } from "@/lib/grading";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/school";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { isTestStudent, sortStudents } from "@/lib/student-sort";
import { classCalendarDate } from "@/lib/late-penalty";
import { isMissingWork } from "@/lib/missing-work";
import { NotebookEmpty, NotebookLoading, NotebookMarginNote } from "@/components/NotebookDecorations";
import { withDiscussionSubmissions } from "@/lib/discussion-completion";

type RosterRow = {
  id: string;
  student_id: string;
  created_at?: string | null;
  droppedAt?: string | null;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: number;
    student_number: string | null;
    is_tester?: boolean | null;
  } | null;
};

type AssignmentRow = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
  created_at?: string | null;
};

type GradeRow = {
  assignment_id: string;
  student_id: string;
  points_earned: number | null;
  comment?: string | null;
  is_draft?: boolean | null;
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
  teacherToday = false,
  hideGrades = false,
  gradingSummary,
  onGradingAttention,
  missingByStudent,
  dateKey,
  academicReads = "ready",
  onRetryAcademic,
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
  teacherToday?: boolean;
  hideGrades?: boolean;
  gradingSummary?: { ungraded: number; drafts: number };
  onGradingAttention?: () => void;
  missingByStudent?: Map<string, Set<string>>;
  dateKey?: string;
  /** Gradebook grade and submission reads. Failed reads must not look like zero missing work. */
  academicReads?: ReadState;
  onRetryAcademic?: () => void;
}) {
  const { user, teacherMode } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [sortMode, setSortMode] = useStudentSort(`pulse-${classId}`);
  const [open, setOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [signalFilter, setSignalFilter] = useState<Signal | null>(null);
  useEffect(() => {
    if (teacherToday && academicReads !== "ready" && signalFilter === "missing") setSignalFilter(null);
  }, [teacherToday, academicReads, signalFilter]);
  useEffect(() => {
    // The teacher strip stays closed so the gradebook remains the first surface.
    if (teacherToday) return;
    if (window.localStorage.getItem(`meraki.pulse-open.${classId}`) === "1") setOpen(true);
  }, [classId, teacherToday]);
  const toggleOpen = () => {
    setOpen((v) => {
      if (!teacherToday) window.localStorage.setItem(`meraki.pulse-open.${classId}`, v ? "0" : "1");
      return !v;
    });
  };
  const todayKey = dateKey ?? classCalendarDate(new Date());

  const { data: myStudentIds = new Set<string>() } = useQuery({
    queryKey: ["pulse-my-students", user?.id],
    enabled: !!user && !isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .or(`user_id.eq.${user!.id},guardian_user_id.eq.${user!.id}`);
      if (error) throw error;
      return new Set((data ?? []).map((s) => s.id));
    },
  });

  const visibleRoster = useMemo(() => {
    // Demo/test accounts never count toward risk, missing-work or slipping metrics.
    const real = roster.filter((r) => !isTestStudent(r.students) && (!teacherToday || !r.droppedAt));
    if (isStaff) return real;
    return real.filter((r) => myStudentIds.has(r.student_id));
  }, [isStaff, roster, myStudentIds, teacherToday]);

  const readPlan = pulseReadPlan({
    staffView: isStaff,
    parentSuppliesMissing: Boolean(teacherToday && missingByStudent),
    assignmentCount: assignments.length,
    rosterCount: visibleRoster.length,
    checkInStudentId: selected,
  });
  const linksQuery = useQuery({
    queryKey: ["pulse-student-links", classId, visibleRoster.length],
    enabled: readPlan.includes("student-links"),
    staleTime: READ_REUSE_MS,
    retry: false,
    queryFn: async () => {
      return fetchByIds(visibleRoster.map((r) => r.student_id), (batch, from, to) =>
        supabase
          .from("students")
          .select("id, user_id, guardian_user_id")
          .in("id", batch)
          .order("id")
          .range(from, to),
      );
    },
  });
  const links = linksQuery.data ?? [];

  const assignmentIds = assignments.map((a) => a.id);
  const assignmentKey = [...assignmentIds].sort().join(",");
  const submissionsQuery = useQuery({
    queryKey: ["pulse-submission-times", classId, assignmentKey],
    enabled: readPlan.includes("submissions"),
    staleTime: READ_REUSE_MS,
    retry: false,
    queryFn: async () => {
      const data = await fetchByIds(assignmentIds, (batch, from, to) =>
        supabase
          .from("assignment_submissions")
          .select("id, submitted_at, assignment_id, student_id")
          .in("assignment_id", batch)
          .order("id")
          .range(from, to),
      );
      return withDiscussionSubmissions(data, assignmentIds);
    },
  });
  const submissions = submissionsQuery.data ?? [];

  // Teacher-only snapshot signals (last 14 days attendance/behavior, last 7 days wellbeing).
  const rosterIds = visibleRoster.map((r) => r.student_id);
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const attendanceQuery = useQuery({
    queryKey: ["pulse-attendance", classId, since14],
    enabled: readPlan.includes("attendance"),
    staleTime: READ_REUSE_MS,
    retry: false,
    queryFn: async () => {
      return fetchAll((from, to) =>
        supabase
          .from("attendance")
          .select("id, student_id, status, date")
          .eq("class_id", classId)
          .gte("date", since14)
          .order("id")
          .range(from, to),
      );
    },
  });
  const attendanceRows = attendanceQuery.data ?? [];

  const behaviorQuery = useQuery({
    queryKey: ["pulse-behavior", classId, rosterIds.length, since14],
    enabled: readPlan.includes("behavior"),
    staleTime: READ_REUSE_MS,
    retry: false,
    queryFn: async () => {
      const groups = await fetchChunks(rosterIds, async (batch) => {
        const { data, error } = await supabase
          .from("behavior_notes")
          .select("id, student_id, kind, date, reason, notes")
          .in("student_id", batch)
          .gte("date", since14)
          .order("date", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      });
      return mergeChunkTops([groups], 200, (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    },
  });
  const behaviorRows = behaviorQuery.data ?? [];

  const wellbeingQuery = useWellbeingFeed("", readPlan.includes("wellbeing"));
  const wellbeingRows = wellbeingQuery.data ?? [];
  const attendanceState = readState(readPlan.includes("attendance"), attendanceQuery);
  const behaviorState = readState(readPlan.includes("behavior"), behaviorQuery);
  const wellbeingState = readState(readPlan.includes("wellbeing"), wellbeingQuery);

  const signals = useMemo(() => {
    const ids = new Set(rosterIds);
    const att = attendanceRows.filter((a) => ids.has(a.student_id));
    const todayAtt = att.filter((a) => a.date === todayKey);
    const absentIds = new Set(att.filter((a) => a.status === "absent" || a.status === "tardy").map((a) => a.student_id));
    const presentDays = att.filter((a) => a.status === "present" || a.status === "tardy").length;
    const rate = att.length ? Math.round((presentDays / att.length) * 100) : null;
    const concerns = behaviorRows.filter((b) => b.kind !== "positive");
    const positives = behaviorRows.length - concerns.length;
    const behaviorIds = new Set(concerns.map((b) => b.student_id));
    const wb = wellbeingRows.filter((w) => ids.has(w.studentId) && w.date >= since7);
    const lowIds = new Set(wb.filter((w) => w.mood <= 2).map((w) => w.studentId));
    const avgMood = wb.length ? wb.reduce((s, w) => s + w.mood, 0) / wb.length : null;
    return {
      rate,
      todayMarked: todayAtt.length,
      todayAbsent: todayAtt.filter((a) => a.status === "absent").length,
      absentIds,
      concerns: concerns.length,
      positives,
      behaviorIds,
      recentBehavior: behaviorRows.slice(0, 3),
      checkins: wb.length,
      avgMood,
      lowIds,
    };
  }, [attendanceRows, behaviorRows, wellbeingRows, rosterIds.join(","), todayKey, since7]);

  const isMissing = (studentId: string, assignment: AssignmentRow) => {
    if (teacherToday && missingByStudent) {
      if (academicReads !== "ready") return false;
      return missingByStudent.get(studentId)?.has(assignment.id) ?? false;
    }
    if (readPlan.includes("submissions") && !submissionsQuery.isSuccess) return false;
    const g = grades.find((x) => x.student_id === studentId && x.assignment_id === assignment.id);
    return isMissingWork({
      assignment,
      grade: g?.is_draft ? null : g,
      submitted: submissions.some((s) => s.assignment_id === assignment.id && s.student_id === studentId),
      today: todayKey,
      enrolledAt: roster.find((r) => r.student_id === studentId)?.created_at ?? null,
      droppedAt: roster.find((r) => r.student_id === studentId)?.droppedAt ?? null,
    });
  };

  const sortedVisibleRoster = useMemo(
    () => sortStudents(visibleRoster, sortMode, (row) => row.students),
    [visibleRoster, sortMode],
  );

  const cards = useMemo(() => {
    const pastDue = assignments;
    return sortedVisibleRoster.map((r) => {
      const avg = studentAverage(r.student_id);
      const missing = pastDue.filter((a) => isMissing(r.student_id, a)).length;

      // Stay gray until the teacher has actually entered scores for this student.
      let status: Status = "none";
      if (avg != null) {
        const risky = avg < 70 || missing >= 3;
        const slipping = avg < 80 || missing >= 1;
        status = risky ? "red" : slipping ? "yellow" : "green";
      }
      return { row: r, avg, missing, status };
    });
  }, [assignments, grades, sortedVisibleRoster, studentAverage, submissions, todayKey, teacherToday, missingByStudent]);

  const counts = cards.reduce<Record<Status, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { green: 0, yellow: 0, red: 0, none: 0 },
  );

  const missingList = useMemo(() => {
    const pastDue = assignments;
    const rows = sortedVisibleRoster
      .map((r) => {
        const items = pastDue.filter((a) => isMissing(r.student_id, a));
        return { row: r, items };
      })
      .filter((entry) => entry.items.length > 0);
    return rows;
  }, [assignments, grades, sortedVisibleRoster, submissions, todayKey, teacherToday, missingByStudent]);

  const totalMissing = missingList.reduce((sum, entry) => sum + entry.items.length, 0);

  const selectedCard = cards.find((c) => c.row.student_id === selected) ?? null;
  const selectedMissing = missingList.find(
    (m) => m.row.student_id === selectedCard?.row.student_id,
  );

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

  if (roster.length === 0 && !teacherToday) return null;

  const signalIds: Record<Signal, Set<string>> = {
    attendance: teacherToday
      ? new Set(attendanceRows.filter((a) => a.date === todayKey && (a.status === "absent" || a.status === "tardy")).map((a) => a.student_id))
      : signals.absentIds,
    missing: new Set(missingList.map((m) => m.row.student_id)),
    behavior: signals.behaviorIds,
    wellbeing: signals.lowIds,
  };
  const filteredCards = cards.filter(
    (c) =>
      (!statusFilter || c.status === statusFilter) &&
      (!signalFilter || signalIds[signalFilter].has(c.row.student_id)),
  );
  const nameFor = (id: string) =>
    studentLabel(visibleRoster.find((r) => r.student_id === id)?.students ?? null, useIds);
  const pickSignal = (s: Signal) => {
    setSignalFilter((cur) => (cur === s ? null : s));
    setSelected(null);
    if (teacherToday) {
      setStatusFilter(null);
      setOpen(false);
    } else if (!open) toggleOpen();
  };

  const tiles: { key: Signal; icon: typeof CalendarCheck; label: string; value: string; detail: string }[] = [
    {
      key: "attendance",
      icon: CalendarCheck,
      label: "Attendance",
      value: teacherToday ? `${signals.todayMarked}/${visibleRoster.length}` : signals.rate == null ? "—" : `${signals.rate}%`,
      detail: teacherToday
        ? `${signals.todayAbsent} absent · ${signalIds.attendance.size - signals.todayAbsent} tardy · ${Math.max(0, visibleRoster.length - signals.todayMarked)} unmarked`
        : signals.todayMarked > 0
          ? `Today: ${signals.todayAbsent} absent · ${signalIds.attendance.size} with absences/tardies (14d)`
          : `Not taken today · ${signalIds.attendance.size} with absences/tardies (14d)`,
    },
    {
      key: "missing",
      icon: ClipboardList,
      label: "Missing work",
      value: String(totalMissing),
      detail: `${missingList.length} student${missingList.length === 1 ? "" : "s"} with past-due items`,
    },
    {
      key: "behavior",
      icon: MessageSquareText,
      label: "Behavior (14d)",
      value: String(signals.concerns),
      detail: `${signals.behaviorIds.size} student${signals.behaviorIds.size === 1 ? "" : "s"} with concerns · ${signals.positives} shout-out${signals.positives === 1 ? "" : "s"}`,
    },
    {
      key: "wellbeing",
      icon: HeartPulse,
      label: "Wellbeing (7d)",
      value: teacherToday ? String(signals.lowIds.size) : signals.avgMood == null ? "—" : `${signals.avgMood.toFixed(1)}/5`,
      detail: `${signals.checkins} check-in${signals.checkins === 1 ? "" : "s"} · ${signals.lowIds.size} feeling low`,
    },
  ];

  const chipState = (key: Signal): ReadState =>
    key === "missing" ? academicReads : key === "attendance" ? attendanceState : key === "behavior" ? behaviorState : wellbeingState;
  const todayDetail = teacherTodayDetail(signalFilter, open);
  const failureLabel = attentionFailureLabel([
    academicReads === "error" ? "grades and missing work" : "",
    attendanceState === "error" ? "attendance" : "",
    behaviorState === "error" ? "behavior" : "",
    wellbeingState === "error" ? "wellbeing" : "",
  ]);
  const familyMissingReady = !readPlan.includes("submissions") || submissionsQuery.isSuccess;
  const familyMissingFailed = readPlan.includes("submissions") && submissionsQuery.isError;

  if (isStaff && teacherToday) {
    const gradingTotal = (gradingSummary?.ungraded ?? 0) + (gradingSummary?.drafts ?? 0);
    const ordered: Signal[] = ["attendance", "missing", "wellbeing", "behavior"];
    const activeTile = tiles.find((tile) => tile.key === signalFilter);
    const retryAttention = () => {
      if (academicReads === "error") onRetryAcademic?.();
      if (attendanceQuery.isError) void attendanceQuery.refetch();
      if (behaviorQuery.isError) void behaviorQuery.refetch();
      if (wellbeingQuery.isError) void wellbeingQuery.refetch();
    };
    return (
      <section aria-labelledby="class-today-heading" className="mt-4 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="class-today-heading" className="notebook-heading mr-1 text-sm font-semibold">Needs attention</h2>
          <span className="text-xs text-muted-foreground">{formatDate(todayKey)}</span>
          {gradingSummary && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 bg-card px-3"
              aria-disabled={academicReads !== "ready"}
              onClick={() => { if (academicReads === "ready") onGradingAttention?.(); }}
            >
              <ClipboardList className="size-3.5 text-muted-foreground" aria-hidden />
              <span>Grading</span>
              <span className="font-semibold tabular-nums">{presentCount(academicReads, gradingTotal)}</span>
              {academicReads === "ready" && (
                <span className="sr-only">{gradingSummary.ungraded} ungraded, {gradingSummary.drafts} draft grades. Opens coursework that needs attention.</span>
              )}
            </Button>
          )}
          {ordered.map((key) => {
            const tile = tiles.find((item) => item.key === key);
            if (!tile) return null;
            const state = chipState(key);
            const pressed = signalFilter === key;
            const Icon = tile.icon;
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={pressed}
                aria-disabled={state !== "ready"}
                onClick={() => { if (state === "ready") pickSignal(key); }}
                className={`h-9 gap-2 px-3 ${pressed ? "border-foreground bg-muted" : "bg-card"}`}
              >
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                <span>{tile.label.replace(/ \(.*\)$/, "")}</span>
                <span className="font-semibold tabular-nums">{presentCount(state, tile.value)}</span>
                {state === "ready" && <span className="sr-only">{tile.detail}</span>}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-2"
            aria-expanded={open}
            onClick={() => {
              setSignalFilter(null);
              setStatusFilter(null);
              setSelected(null);
              toggleOpen();
            }}
          >
            <Sparkles className="size-3.5 text-accent" aria-hidden /> Class pulse
          </Button>
          {(signalFilter || open) && (
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1" onClick={() => { setSignalFilter(null); setStatusFilter(null); setOpen(false); }}>
              <X className="size-3.5" aria-hidden /> Close
            </Button>
          )}
        </div>
        {failureLabel && <LoadError label={failureLabel} onRetry={retryAttention} />}
        {(todayDetail.students || todayDetail.missingList || todayDetail.behaviorNotes) && (
          <div className="mt-3 space-y-3">
            {activeTile && signalFilter && signalFilter !== "missing" && chipState(signalFilter) === "ready" && (
              <p className="text-sm text-muted-foreground">{activeTile.detail}</p>
            )}
            {todayDetail.behaviorNotes && (
              <div>
                {signals.recentBehavior.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No behavior notes in the last 14 days.</p>
                ) : (
                  <>
                    <h3 className="text-sm font-medium">Recent behavior notes</h3>
                    <ul className="mt-2 space-y-1">
                      {signals.recentBehavior.map((note) => (
                        <li key={note.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{nameFor(note.student_id)}</span>
                            <span className="text-muted-foreground">
                              {" "}· {note.kind === "positive" ? "Shout-out" : note.kind === "strike" ? "Strike" : "Concern"}
                              {note.reason ? ` — ${note.reason}` : note.notes ? ` — ${note.notes}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">{formatDate(note.date)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0">
                  <Link to="/behavior" search={{ classId }}>Open behavior log</Link>
                </Button>
              </div>
            )}
            {todayDetail.missingList && academicReads === "ready" && (
              totalMissing === 0 ? (
                <p className="text-sm text-muted-foreground">No missing work. Everyone in this class is caught up.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {totalMissing} past-due {totalMissing === 1 ? "item" : "items"} across {missingList.length} {missingList.length === 1 ? "student" : "students"}, with no score and no hand-in yet.
                  </p>
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {missingList.map(({ row, items }) => (
                      <div key={row.student_id} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold">{studentLabel(row.students, useIds)}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">{items.length} missing</span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {items.map((assignment) => (
                            <li key={assignment.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">{assignment.title}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">due {formatDate(assignment.due_date)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {todayDetail.students && (
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StudentSortControl value={sortMode} onChange={setSortMode} />
                  {!hideGrades && (["green", "yellow", "red", "none"] as Status[]).map((status) => {
                    const on = statusFilter === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={on}
                        onClick={() => { setStatusFilter(on ? null : status); setSelected(null); }}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-foreground bg-muted font-medium" : "border-border"}`}
                      >
                        <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
                        {STATUS_META[status].label}
                        <strong>{counts[status]}</strong>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                  {filteredCards.length === 0 ? (
                    <NotebookEmpty className="col-span-full text-sm text-muted-foreground">No students in this group.</NotebookEmpty>
                  ) : null}
                  {filteredCards.map(({ row, avg, missing, status }) => {
                    const meta = STATUS_META[status];
                    const active = selected === row.student_id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(active ? null : row.student_id)}
                        className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent ${hideGrades ? "border-border bg-card" : meta.ring} ${active ? "ring-2 ring-accent" : ""}`}
                        title={hideGrades ? studentLabel(row.students, useIds) : `${meta.label}${avg == null ? "" : ` · ${avg.toFixed(1)}%`}`}
                      >
                        <span className="relative">
                          <span className="flex size-11 items-center justify-center rounded-full bg-card text-sm font-semibold">
                            {useIds ? (row.students?.student_number ?? "—").slice(-3) : initials(row.students?.first_name, row.students?.last_name)}
                          </span>
                          <span className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card ${hideGrades ? "bg-muted" : meta.dot}`} />
                          {!hideGrades && <span className="sr-only">{meta.label}</span>}
                        </span>
                        <span className="w-full truncate text-xs font-medium">{studentLabel(row.students, useIds)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {hideGrades ? "Grades hidden" : avg == null ? "—" : `${avg.toFixed(0)}%`}
                          {missing > 0 ? ` · ${missing} missing` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedCard && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{studentLabel(selectedCard.row.students, useIds)}</p>
                      <p className="text-xs text-muted-foreground">
                        {!hideGrades && <>{STATUS_META[selectedCard.status].label} · {selectedCard.avg == null ? "no graded work yet" : `${selectedCard.avg.toFixed(1)}% ${letterFor(selectedCard.avg, setup.scale)}`}</>}
                        {selectedCard.missing > 0 ? ` · ${selectedCard.missing} missing item(s)` : ""}
                      </p>
                      {!hideGrades ? <NotebookMarginNote percent={selectedCard.avg} /> : null}
                      {selectedMissing && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                          {selectedMissing.items.map((assignment) => (
                            <li key={assignment.id}>
                              <span className="font-medium text-foreground">{assignment.title}</span>
                              <span className="ml-1">· due {formatDate(assignment.due_date)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (linksQuery.isError) {
                          toast.error("Student contacts couldn't be loaded.");
                          void linksQuery.refetch();
                          return;
                        }
                        checkIn.mutate(selectedCard.row.student_id);
                      }}
                      disabled={checkIn.isPending || linksQuery.isFetching}
                    >
                      <Send className="mr-2 size-4" aria-hidden />
                      {checkIn.isPending ? "Sending…" : "Send check-in"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  // Students and guardians. The staff class page returns the compact strip above.
  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <section className={teacherToday ? "border-b border-border pb-5" : "panel p-5"} aria-label={teacherToday ? "Needs Attention / Today" : "Class snapshot"}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {teacherToday ? "Needs Attention / Today" : "Class snapshot"}
            </h2>
            {signalFilter ? (
              <Button
                variant="ghost" size="sm"
                type="button"
                onClick={() => { setSignalFilter(null); setStatusFilter(null); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" /> Clear filter
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{teacherToday ? formatDate(todayKey) : ""}</span>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {teacherToday && gradingSummary && (
              <Button variant="ghost" onClick={onGradingAttention} className="h-auto min-h-28 flex-col items-stretch justify-start whitespace-normal rounded-lg border border-border p-3 text-left">
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><ClipboardList className="size-3.5" /> Grading</span>
                <span className="block text-2xl font-semibold tabular-nums">{gradingSummary.ungraded + gradingSummary.drafts}</span>
                <span className="text-xs text-muted-foreground">{gradingSummary.ungraded} ungraded · {gradingSummary.drafts} draft grades</span>
              </Button>
            )}
            {tiles.filter((t) => !teacherToday || t.key !== "behavior").map((t) => {
              const on = signalFilter === t.key;
              const Icon = t.icon;
              return (
                <Button
                  variant="ghost"
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickSignal(t.key)}
                  className={`h-auto min-h-28 flex-col items-stretch justify-start whitespace-normal rounded-lg border p-3 text-left transition hover:bg-muted/60 ${
                    on ? "border-foreground/60 bg-muted" : "border-border bg-card"
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" /> {t.label}
                  </span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums">{t.value}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{t.detail}</span>
                </Button>
              );
            })}
          </div>
          {teacherToday && <Button variant="ghost" size="sm" className="mt-2" onClick={() => pickSignal("behavior")} aria-pressed={signalFilter === "behavior"}><MessageSquareText /> Behavior (14d) · {signals.concerns} concerns</Button>}
          {signals.recentBehavior.length > 0 && (
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Recent behavior notes</summary>

              <ul className="mt-2 space-y-1">
                {signals.recentBehavior.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{nameFor(b.student_id)}</span>
                      <span className="text-muted-foreground">
                        {" "}· {b.kind === "positive" ? "Shout-out" : b.kind === "strike" ? "Strike" : "Concern"}
                        {b.reason ? ` — ${b.reason}` : b.notes ? ` — ${b.notes}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatDate(b.date)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      <section className={teacherToday ? "border-b border-border pb-5" : "panel p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            className={teacherToday ? "flex min-w-0 flex-auto basis-full items-start gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent sm:basis-48" : "flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent"}
          >
            <ChevronDown
              className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
            />
            <span className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="size-4 text-accent" />
                {teacherToday && signalFilter ? tiles.find((t) => t.key === signalFilter)?.label ?? "Behavior" : isStaff ? "Pulse" : "My progress"}
              </h2>
              {!teacherToday && <p className="text-sm text-muted-foreground">
                {open
                  ? isStaff
                    ? "Traffic-light view of the class. Tap a student for their standing and a one-click check-in."
                    : "Your current standing and upcoming deadlines at a glance."
                  : "Tap to expand."}
              </p>}
            </span>
          </button>
          <div className="flex flex-wrap gap-2 text-xs">
            {isStaff && open ? <StudentSortControl value={sortMode} onChange={setSortMode} /> : null}
            {!hideGrades && (!teacherToday || open) && (["green", "yellow", "red", "none"] as Status[]).map((s) => {
              const on = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  title={on ? "Show all students" : `Show only ${STATUS_META[s].label.toLowerCase()}`}
                  onClick={() => {
                    setStatusFilter(on ? null : s);
                    setSelected(null);
                    setOpen(true);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent ${
                    on ? "border-foreground bg-muted font-medium" : "border-border"
                  }`}
                >
                  <span className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
                  {STATUS_META[s].label}
                  <strong>{counts[s]}</strong>
                </button>
              );
            })}
                  {statusFilter ? (
              <button
                type="button"
                onClick={() => setStatusFilter(null)}
                className="rounded-full px-3 py-1 text-muted-foreground underline-offset-2 hover:underline"
              >
                Show all
              </button>
            ) : null}
          </div>
        </div>

        {open && (
        <>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {filteredCards.length === 0 ? (
            <NotebookEmpty className="col-span-full text-sm text-muted-foreground">No students in this group.</NotebookEmpty>
          ) : null}
          {filteredCards.map(({ row, avg, missing, status }) => {
            const meta = STATUS_META[status];
            const active = selected === row.student_id;
            return (
              <button
                key={row.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(active ? null : row.student_id)}
                className={`group flex flex-col items-center gap-2 border p-3 text-center transition ${teacherToday ? "rounded-lg hover:bg-muted" : "rounded-xl hover:-translate-y-0.5 hover:shadow-md"} ${hideGrades ? "border-border bg-card" : meta.ring} ${
                  active ? "ring-2 ring-accent" : ""
                }`}
                title={hideGrades ? studentLabel(row.students, useIds) : `${meta.label}${avg == null ? "" : ` · ${avg.toFixed(1)}%`}`}
              >
                <span className="relative">
                  <span className="flex size-11 items-center justify-center rounded-full bg-card text-sm font-semibold shadow-sm">
                    {useIds
                      ? (row.students?.student_number ?? "—").slice(-3)
                      : initials(row.students?.first_name, row.students?.last_name)}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card ${hideGrades ? "bg-muted" : meta.dot}`}
                  />
                  {!hideGrades && <span className="sr-only">{meta.label}</span>}
                </span>
                <span className="w-full truncate text-xs font-medium">
                  {studentLabel(row.students, useIds)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {hideGrades ? "Grades hidden" : avg == null ? "—" : `${avg.toFixed(0)}%`}
                  {missing > 0 ? ` · ${missing} missing` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {selectedCard && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {studentLabel(selectedCard.row.students, useIds)}
              </p>
              <p className="text-xs text-muted-foreground">
                {!hideGrades && <>{STATUS_META[selectedCard.status].label} ·{" "}
                {selectedCard.avg == null
                  ? "no graded work yet"
                  : `${selectedCard.avg.toFixed(1)}% ${letterFor(selectedCard.avg, setup.scale)}`}</>}
                {selectedCard.missing > 0
                  ? ` · ${selectedCard.missing} missing ${isStaff ? "item(s)" : "assignment(s)"}`
                  : ""}
              </p>
              {!hideGrades ? <NotebookMarginNote percent={selectedCard.avg} /> : null}
              {selectedMissing && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {selectedMissing.items.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium text-foreground">{a.title}</span>
                      <span className="ml-1 text-[10px]">· due {formatDate(a.due_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
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
        </>
        )}
      </section>

      <div>
        <section className={teacherToday ? "border-b border-border pb-5" : "panel p-5"}>
          <button
            type="button"
            onClick={() => setMissingOpen((v) => !v)}
            aria-expanded={missingOpen}
            className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardList className="size-4 shrink-0" />
              {isStaff ? "Missing work tracker" : "My missing work"}
              {!missingOpen && familyMissingReady && totalMissing > 0 && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium normal-case text-foreground">
                  {totalMissing}
                </span>
              )}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${missingOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {missingOpen && (
          <p className="mt-1 text-xs text-muted-foreground">
            {isStaff
              ? "Past-due assignments with no score and no hand-in yet."
              : "Your past-due assignments that still need to be turned in."}
          </p>
          )}

          {missingOpen && familyMissingFailed ? (
            <LoadError
              label="Missing work couldn't be loaded. Nothing here is treated as missing until this succeeds."
              onRetry={() => void submissionsQuery.refetch()}
            />
          ) : missingOpen && !familyMissingReady ? (
            <NotebookLoading className="mt-3 text-sm text-muted-foreground">Loading missing work…</NotebookLoading>
          ) : missingOpen && (totalMissing === 0 ? (
            <div className="mt-5 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
              {isStaff
                ? "No missing work — everyone in this class is caught up."
                : "You have no missing assignments. Great work!"}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-warning/15 px-2 py-1 font-medium text-foreground">
                  {totalMissing} missing item{totalMissing === 1 ? "" : "s"}
                </span>
                {isStaff && (
                  <span className="text-muted-foreground">
                    across {missingList.length} student{missingList.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {missingList.map(({ row, items }) => (
                  <div
                    key={row.student_id}
                    className="rounded-xl border border-border bg-muted/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        {studentLabel(row.students, useIds)}
                      </p>
                      <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {items.length} missing
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {items.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0 truncate font-medium">{a.title}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            due {formatDate(a.due_date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

      </div>
    </div>
  );
}
