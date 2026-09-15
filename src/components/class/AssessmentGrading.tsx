import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { proofreadEssay, scoreEssayAnswer } from "@/lib/assessments.functions";
import { QUESTION_KIND_LABELS, type EssayIssue, type QuestionKind } from "@/lib/assessments";
import { gradeTone, percent } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { QuickScoreBar } from "@/components/class/QuickScoreBar";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";


type AnswerRow = {
  id: string;
  question_id: string;
  response: unknown;
  is_correct: boolean | null;
  points_awarded: number | null;
  feedback: string | null;
  assessment_questions: {
    prompt: string;
    kind: string;
    points: number;
    rubric: string | null;
    answer_key: unknown;
  } | null;
};

type SubmissionRow = {
  id: string;
  student_id: string;
  status: string;
  auto_score: number;
  manual_score: number;
  total_points: number;
  submitted_at: string;
  students: { first_name: string; last_name: string; grade_level: number } | null;
};

export function AssessmentGrading({
  assessmentId,
  classId,
  grammarEnabled,
}: {
  assessmentId: string;
  classId: string;
  grammarEnabled: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useStudentSort(`assessment-grading-${assessmentId}`);

  const { data: submissions = [] } = useQuery({
    queryKey: ["assessment-submissions", assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_submissions")
        .select(
          "id, student_id, status, auto_score, manual_score, total_points, submitted_at, students(first_name, last_name, grade_level)",
        )
        .eq("assessment_id", assessmentId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["assessment-roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, students(first_name, last_name, grade_level)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? []) as unknown as {
        student_id: string;
        students: { first_name: string; last_name: string; grade_level: number } | null;
      }[];
    },
  });

  const byStudent = new Map(submissions.map((s) => [s.student_id, s]));
  const rows = roster.map((r) => ({
    student_id: r.student_id,
    students: r.students,
    submission: byStudent.get(r.student_id) ?? null,
  }));
  // Include any submission from a student no longer on the roster.
  for (const s of submissions) {
    if (!roster.some((r) => r.student_id === s.student_id)) {
      rows.push({ student_id: s.student_id, students: s.students, submission: s });
    }
  }

  const sortedRows = sortStudents(rows, sortMode, (row) => ({
    id: row.student_id,
    first_name: row.students?.first_name ?? null,
    last_name: row.students?.last_name ?? null,
  }));

  const completed = rows.filter((r) => r.submission).length;
  const needsReview = rows.filter((r) => r.submission?.status === "needs_review").length;
  const notStarted = rows.length - completed;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Submissions & grading
        </h4>
        <StudentSortControl value={sortMode} onChange={setSortMode} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No students are enrolled in this class yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">
              {completed} of {rows.length} completed
            </Badge>
            {needsReview > 0 && <Badge variant="outline">{needsReview} needs review</Badge>}
            {notStarted > 0 && (
              <Badge variant="outline">{notStarted} not started</Badge>
            )}
          </div>
          <ul className="space-y-2">
            {sortedRows.map((row) => {
              const s = row.submission;
              const score = s ? Number(s.auto_score) + Number(s.manual_score) : 0;
              const pct = s ? percent(score, Number(s.total_points)) : 0;
              return (
                <li
                  key={row.student_id}
                  className="rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {row.students?.last_name}, {row.students?.first_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s
                          ? `Submitted ${new Date(s.submitted_at).toLocaleString()}`
                          : "Not started — nothing submitted yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {s ? (
                        <>
                          <span className={`font-semibold ${gradeTone(pct)}`}>
                            {score}/{s.total_points} ({pct.toFixed(0)}%)
                          </span>
                          {s.status === "needs_review" ? (
                            <Badge variant="outline">Needs review</Badge>
                          ) : (
                            <Badge>Graded</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenId(openId === s.id ? null : s.id)}
                          >
                            {openId === s.id ? "Hide" : "Review"}
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Not started
                        </Badge>
                      )}
                    </div>
                  </div>
                  {s && openId === s.id && (
                    <SubmissionAnswers
                      submissionId={s.id}
                      assessmentId={assessmentId}
                      classId={classId}
                      gradeLevel={row.students?.grade_level}
                      grammarEnabled={grammarEnabled}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}


function SubmissionAnswers({
  submissionId,
  assessmentId,
  classId,
  gradeLevel,
  grammarEnabled,
}: {
  submissionId: string;
  assessmentId: string;
  classId: string;
  gradeLevel?: number | undefined;
  grammarEnabled: boolean;
}) {
  const { data: answers = [] } = useQuery({
    queryKey: ["assessment-answers", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_answers")
        .select(
          "id, question_id, response, is_correct, points_awarded, feedback, assessment_questions(prompt, kind, points, rubric, answer_key)",
        )
        .eq("submission_id", submissionId);
      if (error) throw error;
      return (data ?? []) as unknown as AnswerRow[];
    },
  });

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {answers.map((a) => {
        const question = a.assessment_questions;
        const kind = (question?.kind ?? "essay") as QuestionKind;
        const key = (question?.answer_key ?? {}) as { manual?: boolean; accepted?: string[] };
        // "Answers will vary" short answers are teacher-scored, like essays.
        const manualShort =
          kind === "short_answer" && (Boolean(key.manual) || (key.accepted ?? []).length === 0);
        const response = (a.response ?? {}) as {
          text?: string;
          choice?: number;
          choices?: number[];
          value?: number;
        };
        return (
          <div key={a.id} className="rounded-md bg-card p-3 text-sm">
            <p className="font-medium">{question?.prompt}</p>
            <p className="text-xs text-muted-foreground">
              {QUESTION_KIND_LABELS[kind] ?? kind} · {question?.points} pts
            </p>
            <div className="mt-2 whitespace-pre-wrap rounded bg-secondary/40 p-2 text-sm">
              {kind === "essay"
                ? response.text || "(no response)"
                : kind === "numeric"
                  ? String(response.value ?? "—")
                  : kind === "short_answer"
                    ? response.text || "—"
                    : (response.choices ?? (response.choice != null ? [response.choice] : []))
                        .map((c) => `Choice ${c + 1}`)
                        .join(", ") || "—"}
            </div>
            {kind === "essay" || manualShort ? (
              <EssayReview
                answer={a}
                assessmentId={assessmentId}
                classId={classId}
                submissionId={submissionId}
                gradeLevel={gradeLevel}
                grammarEnabled={grammarEnabled && kind === "essay"}
                maxPoints={Number(question?.points ?? 0)}
              />
            ) : (
              <p className="mt-2 text-xs">
                {a.is_correct ? (
                  <span className="text-success">Correct · {a.points_awarded} pts</span>
                ) : (
                  <span className="text-destructive">
                    Incorrect · {a.points_awarded ?? 0} pts
                  </span>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EssayReview({
  answer,
  assessmentId,
  classId,
  submissionId,
  gradeLevel,
  grammarEnabled,
  maxPoints,
}: {
  answer: AnswerRow;
  assessmentId: string;
  classId: string;
  submissionId: string;
  gradeLevel?: number | undefined;
  grammarEnabled: boolean;
  maxPoints: number;
}) {
  const queryClient = useQueryClient();
  const proof = useServerFn(proofreadEssay);
  const score = useServerFn(scoreEssayAnswer);
  const draftKey = `grade-answer:${answer.id}`;
  const saved = readDraft<{ points: string; feedback: string }>(draftKey);
  const [points, setPoints] = useState(saved?.points ?? String(answer.points_awarded ?? ""));
  const [feedback, setFeedback] = useState(saved?.feedback ?? answer.feedback ?? "");
  const gradeDirty = points.trim().length > 0 || feedback.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, { points, feedback }, { dirty: gradeDirty });


  const { data: reviews = [] } = useQuery({
    queryKey: ["essay-reviews", answer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("essay_reviews")
        .select("id, summary, issues, suggested_points, created_at")
        .eq("answer_id", answer.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runProof = useMutation({
    mutationFn: async () =>
      proof({
        data: { answerId: answer.id, ...(gradeLevel ? { gradeLevel } : {}) },
      }),
    onSuccess: (review) => {
      toast.success("Grammar proof ready");
      if (review?.suggested_points != null && points === "") {
        setPoints(String(review.suggested_points));
      }
      queryClient.invalidateQueries({ queryKey: ["essay-reviews", answer.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const value = Number(points);
      if (Number.isNaN(value) || value < 0 || value > maxPoints)
        throw new Error(`Enter a score between 0 and ${maxPoints}`);
      await score({ data: { answerId: answer.id, points: value, feedback } });
    },
    onSuccess: () => {
      toast.success("Score saved and synced to the gradebook");
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["assessment-answers", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-submissions", assessmentId] });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const latest = reviews[0];
  const issues = (latest?.issues ?? []) as EssayIssue[];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`pts-${answer.id}`}>Score (of {maxPoints})</Label>
          <Input
            id={`pts-${answer.id}`}
            className="h-9 w-24"
            inputMode="decimal"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          Save score
        </Button>
        {grammarEnabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => runProof.mutate()}
            disabled={runProof.isPending}
          >
            {runProof.isPending ? "Proofing…" : "Grammar proof with AI"}
          </Button>
        )}
        <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={gradeDirty} />
      </div>

      <QuickScoreBar
        classId={classId}
        pointsPossible={maxPoints}
        onPick={(value) => setPoints(value)}
      />


      <div className="space-y-1.5">
        <Label htmlFor={`fb-${answer.id}`}>Feedback to student</Label>
        <Textarea
          id={`fb-${answer.id}`}
          rows={2}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>

      {latest && (
        <div className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Grammar proof
            </p>
            <Badge variant="secondary">
              Suggested {latest.suggested_points ?? "—"}/{maxPoints}
            </Badge>
          </div>
          <p className="mt-2 text-sm">{latest.summary}</p>
          {issues.length > 0 && (
            <ul className="mt-3 space-y-2">
              {issues.map((issue, i) => (
                <li key={i} className="rounded bg-secondary/40 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {issue.type}
                    </Badge>
                  </div>
                  <p className="mt-1 line-through decoration-destructive/60">
                    {issue.excerpt}
                  </p>
                  <p className="text-success">{issue.suggestion}</p>
                  <p className="mt-1 text-muted-foreground">{issue.explanation}</p>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() =>
              setFeedback(
                [feedback, latest.summary].filter(Boolean).join("\n\n").slice(0, 5000),
              )
            }
          >
            Copy summary into feedback
          </Button>
        </div>
      )}
    </div>
  );
}
