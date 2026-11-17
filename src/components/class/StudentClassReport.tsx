import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { isHandedIn, resolveWorkState } from "@/lib/coursework-state";
import { withDiscussionSubmissions } from "@/lib/discussion-completion";
import {
  computeAverage,
  findMark,
  letterFor,
  isAutoGradeComment,
  markCodeFromComment,
  type GradingSetup,
} from "@/lib/grading";
import { buildDocument, docHeader, escapeHtml, printHtml } from "@/lib/print-doc";
import { formatDate } from "@/lib/school";
import { shouldAutoFlag } from "@/lib/assignment-status";

type Assignment = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
  created_at?: string | null;
};

type Grade = {
  assignment_id: string;
  student_id: string;
  points_earned: number | null;
  comment: string | null;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: number;
  student_number: string | null;
};

export function StudentClassReport({
  open,
  onOpenChange,
  classId,
  className,
  student,
  assignments,
  grades,
  setup,
  displayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  student: Student | null;
  assignments: Assignment[];
  grades: Grade[];
  setup: GradingSetup;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [showBehavior, setShowBehavior] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const assignmentIds = assignments.map((assignment) => assignment.id);

  const { data: submissions = [] } = useQuery({
    queryKey: ["student-class-report-submissions", classId, student?.id],
    enabled: open && !!student && assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("assignment_id, status, submitted_at, teacher_note")
        .eq("student_id", student?.id ?? "")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      const rows = (data ?? []).map((r) => ({ ...r, student_id: student?.id ?? "" }));
      return withDiscussionSubmissions(rows, assignmentIds, student ? [student.id] : undefined);
    },
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["student-class-report-assessments", classId, student?.id],
    enabled: open && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, due_at, assignment_id, published")
        .eq("class_id", classId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assessmentSubmissions = [] } = useQuery({
    queryKey: ["student-class-report-assessment-submissions", classId, student?.id],
    enabled: open && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_submissions")
        .select("id, assessment_id, status, auto_score, manual_score, total_points, submitted_at")
        .eq("student_id", student?.id ?? "");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: behaviorNotes = [] } = useQuery({
    queryKey: ["student-class-report-behavior", classId, student?.id],
    enabled: open && !!student && showBehavior,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("behavior_notes")
        .select("id, class_id, date, kind, severity, notes")
        .eq("student_id", student?.id ?? "")
        .eq("kind", "strike")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((note) => !note.class_id || note.class_id === classId);
    },
  });

  const assessmentByAssignment = new Map(
    assessments.filter((assessment) => assessment.assignment_id).map((assessment) => [assessment.assignment_id, assessment]),
  );
  const assessmentSubmissionById = new Map(
    assessmentSubmissions.map((submission) => [submission.assessment_id, submission]),
  );

  const rows = useMemo(() => {
    if (!student) return [];
    const assignmentRows = assignments.map((assignment) => {
      const grade = grades.find(
        (entry) => entry.student_id === student.id && entry.assignment_id === assignment.id,
      );
      const submission = submissions.find((entry) => entry.assignment_id === assignment.id);
      const assessment = assessmentByAssignment.get(assignment.id);
      const assessmentSubmission = assessment
        ? assessmentSubmissionById.get(assessment.id)
        : undefined;
      const mark = findMark(markCodeFromComment(grade?.comment), setup.marks);
      const score = grade?.points_earned == null ? null : Number(grade.points_earned);
      const dueDate = assessment?.due_at?.slice(0, 10) ?? assignment.due_date;
      // Saved drafts are not handed in; only submitted/collected/returned count.
      const handedIn = Boolean(isHandedIn(submission?.status) || assessmentSubmission);
      // Only auto-flag Missing when the item existed before its due date and the
      // grace period has passed; backdated work stays neutral ("Assigned").
      const autoFlag = assessment
        ? Boolean(dueDate && dueDate < today)
        : shouldAutoFlag({ created_at: assignment.created_at, due_date: dueDate }, today);
      const missing = Boolean(autoFlag && score == null && !mark && !handedIn);
      const gradeComment =
        grade?.comment && !isAutoGradeComment(grade.comment) ? grade.comment.trim() : "";
      const note = ((submission as { teacher_note?: string | null } | undefined)?.teacher_note ?? "").trim();
      const comment = [gradeComment, note && note !== gradeComment ? note : ""].filter(Boolean).join("\n\n");
      const status = resolveWorkState({
        score,
        markLabel: mark?.label,
        submissionStatus: submission?.status,
        handedInElsewhere: Boolean(assessmentSubmission),
        missing,
        pastDue: Boolean(dueDate && dueDate < today),
      }).label;
      return {
        key: assignment.id,
        assignmentId: assignment.id,
        assessmentId: assessment?.id ?? null,
        assessmentSubmissionId: assessmentSubmission?.id ?? null,
        autoScore: Number(assessmentSubmission?.auto_score ?? 0),
        title: assignment.title,
        category: assignment.category,
        kind: assessment ? "Assessment" : "Assignment",
        dueDate,
        pointsPossible: Number(assignment.points_possible),
        score,
        markCode: mark?.code ?? null,
        status,
        comment,
        completed: Boolean(score != null || mark || handedIn),
      };
    });
    const linkedAssessmentIds = new Set(
      assessments.filter((assessment) => assessment.assignment_id).map((assessment) => assessment.id),
    );
    const unlinkedRows = assessments
      .filter((assessment) => !linkedAssessmentIds.has(assessment.id) && !assessment.assignment_id)
      .map((assessment) => {
        const submission = assessmentSubmissionById.get(assessment.id);
        const score = submission
          ? Number(submission.auto_score) + Number(submission.manual_score)
          : null;
        const dueDate = assessment.due_at?.slice(0, 10) ?? null;
        const missing = Boolean(dueDate && dueDate < today && !submission);
        return {
          key: `assessment-${assessment.id}`,
          assignmentId: null,
          assessmentId: assessment.id,
          assessmentSubmissionId: submission?.id ?? null,
          autoScore: Number(submission?.auto_score ?? 0),
          title: assessment.title,
          category: "Assessment",
          kind: "Assessment",
          dueDate,
          pointsPossible: Number(submission?.total_points ?? 0),
          score,
          markCode: null,
          comment: "",
          status: submission ? (submission.status === "needs_review" ? "Needs review" : "Graded") : missing ? "Missing" : "Not started",
          completed: Boolean(submission),
        };
      });
    return [...assignmentRows, ...unlinkedRows].sort((left, right) => {
      if (!left.dueDate && !right.dueDate) return left.title.localeCompare(right.title);
      if (!left.dueDate) return 1;
      if (!right.dueDate) return -1;
      return left.dueDate.localeCompare(right.dueDate);
    });
  }, [
    assessmentByAssignment,
    assessmentSubmissionById,
    assessments,
    assignments,
    grades,
    setup.marks,
    student,
    submissions,
    today,
  ]);

  const studentAverage = student
    ? computeAverage(
        assignments.map((assignment) => {
          const grade = grades.find(
            (entry) => entry.student_id === student.id && entry.assignment_id === assignment.id,
          );
          return {
            category: assignment.category,
            pointsPossible: Number(assignment.points_possible),
            pointsEarned: grade?.points_earned == null ? null : Number(grade.points_earned),
            markCode: markCodeFromComment(grade?.comment),
          };
        }),
        setup,
      )
    : null;
  const completedCount = rows.filter((row) => row.completed).length;
  const completionRate = rows.length ? (completedCount / rows.length) * 100 : 0;

  const saveScore = useMutation({
    mutationFn: async (input: {
      assignmentId: string | null;
      assessmentSubmissionId: string | null;
      autoScore: number;
      pointsPossible: number;
      value: string;
    }) => {
      if (!student) throw new Error("Choose a student");
      const raw = input.value.trim();
      const mark = findMark(raw ? raw.toUpperCase() : null, setup.marks);
      const points = mark || raw === "" ? null : Number(raw);
      if (!mark && raw !== "" && (Number.isNaN(points) || Number(points) < 0 || Number(points) > 10000)) {
        throw new Error("Enter a valid score or special mark");
      }
      if (input.assignmentId) {
        const { data: latestGrade, error: latestGradeError } = await supabase
          .from("grades")
          .select("comment")
          .eq("assignment_id", input.assignmentId)
          .eq("student_id", student.id)
          .maybeSingle();
        if (latestGradeError) throw latestGradeError;
        const previous = latestGrade?.comment ?? null;
        const keptComment = markCodeFromComment(previous) ? null : previous;
        const { error } = await supabase.from("grades").upsert(
          {
            assignment_id: input.assignmentId,
            student_id: student.id,
            points_earned: points,
            comment: mark ? `MARK:${mark.code}` : keptComment,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
        if (error) throw error;
      }
      if (input.assessmentSubmissionId && points != null) {
        const { error } = await supabase
          .from("assessment_submissions")
          .update({
            manual_score: Number(points) - input.autoScore,
            total_points: input.pointsPossible,
            status: "graded",
            graded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.assessmentSubmissionId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Score saved everywhere");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grades"] }),
        queryClient.invalidateQueries({ queryKey: ["assessment-submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["student-class-report-assessment-submissions"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function printReport() {
    if (!student) return;
    const itemRows = rows
      .map((row) => {
        const score = row.markCode
          ? row.status
          : row.score == null
            ? row.status
            : `${row.score}/${row.pointsPossible} (${row.pointsPossible ? ((row.score / row.pointsPossible) * 100).toFixed(1) : "0.0"}%)`;
        const commentCell = showComments
          ? `<td>${row.comment ? escapeHtml(row.comment).replace(/\n/g, "<br />") : "<span class='muted'>—</span>"}</td>`
          : "";
        return `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.dueDate ? formatDate(row.dueDate) : "No due date")}</td><td>${escapeHtml(score)}</td>${commentCell}</tr>`;
      })
      .join("");
    const behavior = showBehavior
      ? `<h2>Behavior strikes</h2>${behaviorNotes.length ? `<table><tr><th>Date</th><th>Severity</th><th>Note</th></tr>${behaviorNotes.map((note) => `<tr><td>${escapeHtml(formatDate(note.date))}</td><td>${note.severity}</td><td>${escapeHtml(note.notes ?? "—")}</td></tr>`).join("")}</table>` : "<p class='muted'>No behavior strikes recorded.</p>"}`
      : "";
    printHtml(
      buildDocument(
        `${displayName} — ${className}`,
        `${docHeader("Student progress report", [displayName, className, `Grade ${student.grade_level}`])}
        <table><tr><th>Current grade</th><th>Letter</th><th>Completion</th><th>Completed items</th></tr>
        <tr><td class="num">${studentAverage == null ? "—" : `${studentAverage.toFixed(1)}%`}</td><td>${studentAverage == null ? "—" : escapeHtml(letterFor(studentAverage, setup.scale))}</td><td class="num">${completionRate.toFixed(0)}%</td><td class="num">${completedCount}/${rows.length}</td></tr></table>
        <h2>Assignments and assessments</h2><table><tr><th>Item</th><th>Category</th><th>Due date</th><th>Score / status</th>${showComments ? "<th>Teacher comments</th>" : ""}</tr>${itemRows}</table>${behavior}`,
      ),
    );
  }

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto print:max-w-none">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>{className} · Grade {student.grade_level} · Detailed progress report</DialogDescription>
            </div>
            <Button type="button" variant="outline" onClick={printReport}>
              <Printer className="size-4" /> Print report
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Current grade</p>
            <p className="mt-1 text-2xl font-semibold">{studentAverage == null ? "—" : `${studentAverage.toFixed(1)}%`}</p>
            <p className="text-sm text-muted-foreground">{studentAverage == null ? "No graded work" : letterFor(studentAverage, setup.scale)}</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Completion</p>
            <p className="mt-1 text-2xl font-semibold">{completionRate.toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground">{completedCount} of {rows.length} items</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Needs attention</p>
            <p className="mt-1 text-2xl font-semibold">{rows.filter((row) => row.status === "Missing").length}</p>
            <p className="text-sm text-muted-foreground">Missing or incomplete</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm [overflow-wrap:anywhere]">
            <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Score</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const percent = row.score != null && row.pointsPossible > 0 ? (row.score / row.pointsPossible) * 100 : null;
                const initialValue = row.markCode ?? (row.score == null ? "" : String(row.score));
                return (
                  <tr key={row.key} className="border-t border-border odd:bg-card even:bg-secondary/20">
                    <td className="px-3 py-3"><p className="font-semibold">{row.title}</p><p className="text-xs text-muted-foreground">{row.kind}</p>{showComments && row.comment ? <p className="mt-1 whitespace-pre-line rounded-md border border-border bg-secondary/30 p-2 text-xs text-foreground"><span className="font-medium">Comment: </span>{row.comment}</p> : null}</td>
                    <td className="px-3 py-3"><Badge variant="secondary">{row.category}</Badge></td>
                    <td className="px-3 py-3 text-muted-foreground">{row.dueDate ? formatDate(row.dueDate) : "No due date"}</td>
                    <td className="px-3 py-3"><Badge variant={row.status === "Missing" ? "destructive" : row.status === "Graded" ? "default" : "outline"}>{row.status}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Input
                          key={`${row.key}-${initialValue}`}
                          aria-label={`Score for ${row.title}`}
                          className="h-9 w-24"
                          defaultValue={initialValue}
                          placeholder="Score"
                          disabled={!row.assignmentId && !row.assessmentSubmissionId}
                          onBlur={(event) => {
                            if (event.target.value.trim() === initialValue) return;
                            saveScore.mutate({
                              assignmentId: row.assignmentId,
                              assessmentSubmissionId: row.assessmentSubmissionId,
                              autoScore: row.autoScore,
                              pointsPossible: row.pointsPossible,
                              value: event.target.value,
                            });
                          }}
                        />
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          / {row.pointsPossible || "—"}{percent == null ? "" : ` · ${percent.toFixed(1)}% · ${letterFor(percent, setup.scale)}`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="show-comments">Include assignment comments</Label>
              <p className="text-xs text-muted-foreground">Shows your written feedback on each item, here and on the printed copy.</p>
            </div>
            <Switch id="show-comments" checked={showComments} onCheckedChange={setShowComments} />
          </div>
        </section>

        <section className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="show-behavior">Include behavior strikes</Label>
              <p className="text-xs text-muted-foreground">Controls both this report and the printed copy.</p>
            </div>
            <Switch id="show-behavior" checked={showBehavior} onCheckedChange={setShowBehavior} />
          </div>
          {showBehavior && (
            <div className="mt-4">
              {behaviorNotes.length === 0 ? <p className="text-sm text-muted-foreground">No behavior strikes recorded.</p> : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {behaviorNotes.map((note) => <li key={note.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[8rem_6rem_1fr]"><span>{formatDate(note.date)}</span><span>Severity {note.severity}</span><span>{note.notes ?? "—"}</span></li>)}
                </ul>
              )}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}