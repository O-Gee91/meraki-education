import { resolveWorkState } from "@/lib/coursework-state";
import { isMissingWork } from "@/lib/missing-work";
import { withDiscussionSubmissions } from "@/lib/discussion-completion";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Inbox,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { useTeacherScope } from "@/hooks/useTeacherScope";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/school";
import { isAutoGradeComment, markCodeFromComment } from "@/lib/grading";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — Meraki Education" },
      {
        name: "description",
        content: "Every assignment across your classes, with due dates, status and posted scores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Assignments — Meraki Education" },
      {
        property: "og:description",
        content: "Every assignment across your classes, with due dates, status and posted scores.",
      },
    ],
  }),
  component: AssignmentsHubPage,
});

type Filter = "all" | "due" | "missing" | "graded";

type HubRow = {
  assignmentId: string;
  classId: string;
  className: string;
  title: string;
  description: string | null;
  category: string;
  pointsPossible: number;
  dueDate: string | null;
  submissionMode: string;
  status: "graded" | "submitted" | "missing" | "due" | "upcoming";
  score: number | null;
  feedback: string;
  isLate: boolean;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "Due soon" },
  { id: "missing", label: "Missing" },
  { id: "graded", label: "Graded" },
];

function AssignmentsHubPage() {
  const { primaryRole, previewingStudent } = useAuth();
  const previewScope = useTeacherScope();
  const isGuardian = primaryRole === "parent";
  const [filter, setFilter] = useState<Filter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Students resolve to their own record, guardians to every linked child and
  // staff previews to the demo Student Tester only.
  const { students: children } = useSelfStudents();
  const [childId, setChildId] = useState<string | null>(null);
  const activeChild = children.find((c) => c.id === childId) ?? children[0] ?? null;
  const studentIds = activeChild ? [activeChild.id] : [];

  const { data: enrollments = [] } = useQuery({
    queryKey: ["hub-enrollments", studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, class_id, created_at, classes(id, name)")
        .in("student_id", studentIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  // Staff previewing as a student only see their own classes.
  const classIds = Array.from(new Set(enrollments.map((e) => e.class_id))).filter(
    (id) => !previewingStudent || previewScope.classIds?.has(id),
  );
  const className = (id: string) =>
    enrollments.find((e) => e.class_id === id)?.classes?.name ?? "Class";

  const { data: assignments = [] } = useQuery({
    queryKey: ["hub-assignments", classIds],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id, class_id, title, description, category, points_possible, due_date, submission_mode, created_at, status",
        )
        .in("class_id", classIds)
        .eq("status", "published")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const assignmentIds = assignments.map((a) => a.id);

  const { data: submissions = [] } = useQuery({
    queryKey: ["hub-submissions", assignmentIds, studentIds],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const data = await fetchAll((from, to) =>
        supabase
          .from("assignment_submissions")
          .select("assignment_id, student_id, status, is_late, submitted_at")
          .in("assignment_id", assignmentIds)
          .in("student_id", studentIds)
          .order("id")
          .range(from, to),
      );
      return withDiscussionSubmissions(data, assignmentIds, studentIds);
    },
  });

  // RLS already hides draft grades from students and guardians.
  const { data: grades = [] } = useQuery({
    queryKey: ["hub-grades", assignmentIds, studentIds],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      return fetchAll((from, to) =>
        supabase
          .from("grades")
          .select("assignment_id, student_id, points_earned, comment")
          .eq("is_draft", false)
          .in("assignment_id", assignmentIds)
          .in("student_id", studentIds)
          .order("id")
          .range(from, to),
      );
    },
  });

  const rows = useMemo<HubRow[]>(() => {
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    return assignments.map((a) => {
      // The child selector scopes the whole list to one student.
      const sid = studentIds[0];
      const sub = submissions.find(
        (s) => s.assignment_id === a.id && s.student_id === sid,
      );
      const grade = grades.find(
        (g) => g.assignment_id === a.id && g.student_id === sid,
      );
      const turnedIn =
        sub != null && ["submitted", "collected", "returned"].includes(sub.status);
      let status: HubRow["status"];
      const missing = isMissingWork({
        assignment: a,
        grade,
        submitted: turnedIn,
        today,
        enrolledAt: enrollments.find((e) => e.class_id === a.class_id)?.created_at ?? null,
      });
      const mark = markCodeFromComment(grade?.comment);
      const ws = resolveWorkState({
        score: grade?.points_earned == null ? null : Number(grade.points_earned),
        markLabel: mark && mark !== "M" ? mark : null,
        submissionStatus: sub?.status,
        missing,
        pastDue: !!a.due_date && a.due_date < today,
      });
      // An explicit "M" mark always reads as missing for students.
      if (missing || mark === "M") status = "missing";
      else if (ws.state === "graded" || ws.state === "marked") status = "graded";
      else if (ws.state === "collected" || ws.state === "turned_in") status = "submitted";
      else if (a.due_date && a.due_date <= soon) status = "due";
      else status = "upcoming";
      const feedback =
        grade?.comment && !isAutoGradeComment(grade.comment) ? grade.comment.trim() : "";
      return {
        assignmentId: a.id,
        classId: a.class_id,
        className: className(a.class_id),
        title: a.title,
        description: a.description,
        category: a.category,
        pointsPossible: Number(a.points_possible),
        dueDate: a.due_date,
        submissionMode: a.submission_mode,
        status,
        score: grade?.points_earned == null ? null : Number(grade.points_earned),
        feedback,
        isLate: Boolean(sub?.is_late),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, submissions, grades, studentIds, today, enrollments]);

  const classRows = rows.filter((r) => classFilter === "all" || r.classId === classFilter);
  const counts = {
    all: classRows.length,
    due: classRows.filter((r) => r.status === "due").length,
    missing: classRows.filter((r) => r.status === "missing").length,
    graded: classRows.filter((r) => r.status === "graded").length,
  };
  const visible = classRows.filter((r) => filter === "all" || r.status === filter);

  return (
    <AppShell
      desktopReview
      title={isGuardian ? "Your child's assignments" : "My assignments"}
      description="Every assignment across your classes — due dates, status and posted scores."
    >
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isGuardian
            ? "No child is linked to your account yet — ask the school office to connect you."
            : "Your account isn't linked to a student record yet — ask your teacher or the office."}
        </p>
      ) : (
        <>
          {children.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Choose child">
              <span className="text-sm text-muted-foreground">Showing</span>
              {children.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={activeChild?.id === c.id ? "secondary" : "ghost"}
                  aria-pressed={activeChild?.id === c.id}
                  onClick={() => {
                    setChildId(c.id);
                    setOpenId(null);
                  }}
                >
                  {c.first_name} {c.last_name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter assignments">
            {classIds.length > 1 && (
              <select
                aria-label="Filter by class"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="all">All classes</option>
                {classIds.map((id) => (
                  <option key={id} value={id}>{className(id)}</option>
                ))}
              </select>
            )}
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
              >
                {f.label}
                <span className="ml-1.5 text-xs opacity-70">{counts[f.id]}</span>
              </Button>
            ))}
          </div>

          <div className="mt-4 divide-y divide-border border-y border-border">
            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {filter === "missing"
                  ? "Nothing missing — great job staying on top of your work."
                  : filter === "graded"
                    ? "No posted grades yet."
                    : filter === "due"
                      ? "Nothing due in the next week."
                      : "No assignments yet."}
              </p>
            ) : (
              visible.map((row) => {
                const open = openId === row.assignmentId;
                return (
                  <article key={row.assignmentId} className="py-3">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 text-left"
                      onClick={() => setOpenId(open ? null : row.assignmentId)}
                      aria-expanded={open}
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{row.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.className} · {row.category}
                          {row.dueDate ? ` · Due ${formatDate(row.dueDate)}` : " · No due date"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusChip row={row} />
                        {row.status === "graded" && row.score != null ? (
                          <span className="text-sm font-semibold tabular-nums">
                            {row.score}/{row.pointsPossible}
                          </span>
                        ) : null}
                        {open ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                    {open ? (
                      <div className="mt-3 space-y-3 rounded-md border border-border/60 bg-muted/20 p-4">
                        {row.description ? (
                          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                            {row.description}
                          </p>
                        ) : null}
                        {row.feedback ? (
                          <p className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
                            <span className="font-medium">Teacher feedback: </span>
                            {row.feedback}
                          </p>
                        ) : null}
                        {isGuardian ? (
                          <p className="text-xs text-muted-foreground">
                            Guardians see posted grades and feedback only.
                          </p>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link to="/classes/$classId" params={{ classId: row.classId }}>
                              Open in {row.className}
                            </Link>
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

function StatusChip({ row }: { row: HubRow }) {
  if (row.status === "graded")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Graded
      </span>
    );
  if (row.status === "missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/60 bg-warning/20 px-2 py-0.5 text-xs font-medium">
        <TriangleAlert className="h-3.5 w-3.5 text-warning-foreground" aria-hidden /> Missing
      </span>
    );
  if (row.status === "submitted")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium">
        <Inbox className="h-3.5 w-3.5 text-primary" aria-hidden /> Turned in
        {row.isLate ? " · Late" : ""}
      </span>
    );
  if (row.status === "due")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
        <Clock className="h-3.5 w-3.5" aria-hidden /> Due soon
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" aria-hidden /> Not due yet
    </span>
  );
}
