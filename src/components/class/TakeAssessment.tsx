import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Maximize2, MessageSquareText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getAssessmentPaper, submitAssessment } from "@/lib/assessments.functions";
import type { AnswerResponse } from "@/lib/assessments";
import { gradeTone, percent } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import {
  DEFAULT_TIME_ZONE,
  formatZoned,
  windowState,
  zoneLabel,
} from "@/lib/coursework-window";

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useAssessmentTimer(
  limitMinutes: number | null | undefined,
  assessmentId: string,
  enabled: boolean,
  onExpire: () => void,
) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!limitMinutes || !enabled) return;
    const key = `assessment-start:${assessmentId}`;
    let start = Number(localStorage.getItem(key));
    if (!start || Number.isNaN(start)) {
      start = Date.now();
      localStorage.setItem(key, String(start));
    }
    setStarted(true);
    const limitMs = limitMinutes * 60 * 1000;
    const tick = () => {
      const left = start + limitMs - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) onExpire();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [limitMinutes, assessmentId, enabled, onExpire]);

  return { remaining, started };
}

export function TakeAssessment({ assessmentId }: { assessmentId: string }) {
  const queryClient = useQueryClient();
  const loadPaper = useServerFn(getAssessmentPaper);
  const send = useServerFn(submitAssessment);
  const draftKey = `assessment:${assessmentId}`;
  const [responses, setResponses] = useState<Record<string, AnswerResponse>>(
    () => readDraft<Record<string, AnswerResponse>>(`assessment:${assessmentId}`) ?? {},
  );
  const [hasStarted, setHasStarted] = useState(false);

  // Assessment mode: while the paper is open we take over the screen so the
  // navigation tabs, banners and other classwork are out of sight.
  useEffect(() => {
    if (!hasStarted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hasStarted]);
  const answered = Object.keys(responses).length > 0;
  const draft = useAutosaveDraft(draftKey, responses, { dirty: answered });

  useEffect(() => {
    if (answered) toast.info("Restored your autosaved answers — submit when you're finished.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assessment-paper", assessmentId],
    queryFn: () => loadPaper({ data: { assessmentId } }),
  });

  const { data: mySubmission } = useQuery({
    queryKey: ["my-submission", assessmentId],
    queryFn: async () => {
      // Never use .single()/.maybeSingle() here: a student can be visible through
      // more than one roster link, which makes PostgREST throw "JSON object
      // requested, multiple (or no) rows returned" mid-quiz.
      const { data: rows, error: err } = await supabase
        .from("assessment_submissions")
        .select(
          "id, status, auto_score, manual_score, total_points, submitted_at, is_late, late_accepted",
        )
        .eq("assessment_id", assessmentId)
        .order("submitted_at", { ascending: false })
        .limit(1);
      if (err) throw err;
      return rows?.[0] ?? null;
    },
  });


  const submit = useMutation({
    mutationFn: async () => {
      const answers = (data?.questions ?? []).map((q) => ({
        questionId: q.id,
        response: responses[q.id] ?? {},
      }));
      return send({ data: { assessmentId, answers } });
    },
    onSuccess: (result) => {
      localStorage.removeItem(`assessment-start:${assessmentId}`);
      toast.success(
        result.needsReview
          ? `Submitted — ${result.autoScore}/${result.totalPoints} auto-graded, written answers await review`
          : `Submitted — you scored ${result.autoScore}/${result.totalPoints}`,
      );
      draft.clear();
      setHasStarted(false);
      queryClient.invalidateQueries({ queryKey: ["my-submission", assessmentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limitMinutes = data?.assessment.time_limit_minutes;
  const isTimed = Boolean(limitMinutes && limitMinutes > 0);
  const { remaining, started } = useAssessmentTimer(limitMinutes, assessmentId, hasStarted, () => {
    if (!submit.isPending && !mySubmission) {
      toast.warning("Time is up — your assessment is being submitted automatically.");
      submit.mutate();
    }
  });
  const urgent = remaining != null && remaining <= 60_000;
  const warning = remaining != null && remaining <= 5 * 60_000 && !urgent;

  const closesAt = data?.assessment.closes_at ?? null;
  const availableFrom = data?.assessment.available_from ?? null;
  const timeZone = data?.timeZone ?? DEFAULT_TIME_ZONE;
  const state = windowState(availableFrom, closesAt);

  // When the end time arrives mid-paper, hand the work in exactly as it stands.
  // A paper that was already closed before the student started is a deliberate
  // late attempt: leave it alone so they can actually write something.
  useEffect(() => {
    if (!hasStarted || !closesAt || mySubmission || submit.isPending) return;
    const end = Date.parse(closesAt);
    if (Number.isNaN(end)) return;
    const remainingMs = end - Date.now();
    if (remainingMs <= 0) return;
    const timer = setTimeout(() => {
      toast.warning("The assessment has closed — your work is being handed in as it is.");
      submit.mutate();
    }, remainingMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, closesAt, mySubmission, submit.isPending]);


  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  if (state === "not_yet" && !mySubmission) {
    return (
      <div className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-medium">Not yet available</p>
        <p className="text-muted-foreground">
          This opens {formatZoned(availableFrom, timeZone)} ({zoneLabel(timeZone)}).
        </p>
      </div>
    );
  }

  if (mySubmission) {
    const score = Number(mySubmission.auto_score) + Number(mySubmission.manual_score);
    const pct = percent(score, Number(mySubmission.total_points));
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">You submitted this assessment.</p>
        <p className={gradeTone(pct)}>
          {score}/{mySubmission.total_points} ({pct.toFixed(0)}%)
        </p>
        {mySubmission.status === "needs_review" && (
          <Badge variant="outline">Written responses awaiting teacher review</Badge>
        )}
        {mySubmission.is_late && !mySubmission.late_accepted ? (
          <Badge variant="destructive">
            Handed in late — your teacher decides whether it counts
          </Badge>
        ) : null}
        <AnswerFeedback
          submissionId={mySubmission.id}
          questions={data.questions.map((q) => ({ id: q.id, position: q.position, prompt: q.prompt }))}
        />
      </div>
    );
  }

  const setResponse = (id: string, next: AnswerResponse) =>
    setResponses((prev) => ({ ...prev, [id]: next }));

  if (!hasStarted) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          {isTimed ? (
            <Clock className="mt-0.5 size-6 text-destructive" />
          ) : (
            <Maximize2 className="mt-0.5 size-6 text-primary" />
          )}
          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold">
              {isTimed ? "Timed assessment" : "Assessment mode"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isTimed ? (
                <>
                  This assessment has a <strong>{limitMinutes} minute</strong> timer. Once you
                  click <strong>Start assessment</strong>, the timer begins and cannot be
                  paused.
                </>
              ) : (
                <>
                  Starting opens <strong>assessment mode</strong> — a full-screen view with no
                  tabs, menus or banners so you can focus on your work.
                </>
              )}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>The rest of the site is hidden until you submit or exit.</li>
              {isTimed ? (
                <li>Complete it in one sitting — leaving the page will not stop the timer.</li>
              ) : (
                <li>You can leave assessment mode and come back to finish later.</li>
              )}
              <li>Your answers autosave, but only your final submission is counted.</li>
              {isTimed ? (
                <li>When time runs out, your work will be submitted automatically.</li>
              ) : null}
              {closesAt && state === "open" ? (
                <li>
                  This closes {formatZoned(closesAt, timeZone)} — anything unfinished is
                  handed in for you at that moment.
                </li>
              ) : null}
              {state === "closed" ? (
                <li className="text-destructive">
                  This closed {formatZoned(closesAt, timeZone)}. You can still hand work in,
                  but it is marked late and your teacher decides whether it counts.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={() => {
              setHasStarted(true);
              toast.info(isTimed ? "Timer started — good luck!" : "Assessment mode on");
            }}
          >
            {state === "closed" ? "Start late attempt" : "Start assessment"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Click only when you are ready to begin.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Assessment mode
          </p>
          <h2 className="font-display text-lg font-semibold">{data.assessment.title}</h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (isTimed) {
              toast.warning("The timer keeps running — reopen the assessment to continue.");
            }
            setHasStarted(false);
          }}
        >
          <X className="mr-1 size-4" />
          Exit
        </Button>
      </div>
      {limitMinutes && started && remaining != null && (
        <div
          className={`sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-float ${
            urgent
              ? "animate-pulse border-destructive bg-destructive text-destructive-foreground"
              : warning
                ? "border-warning bg-warning text-warning-foreground"
                : "border-primary bg-primary text-primary-foreground"
          }`}
          role="timer"
          aria-live={urgent ? "assertive" : "polite"}
          aria-label={`Time remaining: ${formatTime(remaining)}`}
        >
          <div className="flex items-center gap-2 font-display font-semibold">
            <Clock className="size-5" />
            <span>Time remaining: {formatTime(remaining)}</span>
          </div>
          <div className="text-sm font-medium">
            {urgent
              ? "Time is almost up — submit now!"
              : warning
                ? "Less than 5 minutes left"
                : `${limitMinutes} minute limit`}
          </div>
        </div>
      )}
      {data.assessment.instructions && (
        <p className="text-sm text-muted-foreground">{data.assessment.instructions}</p>
      )}
      {data.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Your teacher hasn't added questions yet.
        </p>
      ) : (
        <ol className="space-y-4">
          {data.questions.map((q, i) => {
            const value = responses[q.id] ?? {};
            return (
              <li key={q.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  {i + 1}. {q.prompt}
                </p>
                <p className="text-xs text-muted-foreground">{q.points} pts</p>
                <div className="mt-3">
                  {(q.kind === "multiple_choice" || q.kind === "true_false") && (
                    <RadioGroup
                      value={value.choice != null ? String(value.choice) : ""}
                      onValueChange={(v) => setResponse(q.id, { choice: Number(v) })}
                    >
                      {q.options.map((opt, di) => {
                        const oi = q.optionIndices?.[di] ?? di;
                        return (
                        <label key={oi} className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value={String(oi)} id={`${q.id}-${oi}`} />
                          {opt}
                        </label>
                        );
                      })}
                    </RadioGroup>
                  )}
                  {q.kind === "multi_select" && (
                    <div className="space-y-2">
                      {q.options.map((opt, di) => {
                        const oi = q.optionIndices?.[di] ?? di;
                        const chosen = value.choices ?? [];
                        return (
                          <label key={oi} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={chosen.includes(oi)}
                              onCheckedChange={(v) =>
                                setResponse(q.id, {
                                  choices:
                                    v === true
                                      ? [...chosen, oi]
                                      : chosen.filter((c) => c !== oi),
                                })
                              }
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {q.kind === "short_answer" && (
                    <Input
                      value={value.text ?? ""}
                      onChange={(e) => setResponse(q.id, { text: e.target.value })}
                    />
                  )}
                  {q.kind === "numeric" && (
                    <Input
                      inputMode="decimal"
                      value={value.value != null ? String(value.value) : ""}
                      onChange={(e) => setResponse(q.id, { value: Number(e.target.value) })}
                    />
                  )}
                  {q.kind === "essay" && (
                    <div className="space-y-1.5">
                      {q.rubric && (
                        <p className="text-xs text-muted-foreground">Rubric: {q.rubric}</p>
                      )}
                      <Label htmlFor={`essay-${q.id}`} className="sr-only">
                        Your response
                      </Label>
                      <Textarea
                        id={`essay-${q.id}`}
                        rows={8}
                        value={value.text ?? ""}
                        onChange={(e) => setResponse(q.id, { text: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {data.questions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit assessment"}
          </Button>
          <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={answered} />
          {answered ? (
            <span className="text-xs text-muted-foreground">
              Your answers save automatically, but only count once you submit.
            </span>
          ) : null}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Written feedback the teacher left on individual answers. Row-level security
 * limits these rows to the student's own attempt (and their guardian).
 */
function AnswerFeedback({
  submissionId,
  questions,
}: {
  submissionId: string;
  questions: { id: string; position: number; prompt: string }[];
}) {
  const { data: answers = [] } = useQuery({
    queryKey: ["my-answer-feedback", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_answers")
        .select("id, question_id, feedback, points_awarded")
        .eq("submission_id", submissionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const withFeedback = answers.filter((a) => (a.feedback ?? "").trim().length > 0);
  if (withFeedback.length === 0) return null;

  const promptOf = (questionId: string) => questions.find((q) => q.id === questionId);

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText className="size-4 text-accent" />
        Feedback from your teacher
      </p>
      <ul className="space-y-2">
        {withFeedback
          .slice()
          .sort(
            (a, b) =>
              (promptOf(a.question_id)?.position ?? 0) - (promptOf(b.question_id)?.position ?? 0),
          )
          .map((a) => {
            const q = promptOf(a.question_id);
            return (
              <li key={a.id} className="rounded-md bg-card/70 p-2 text-xs">
                <p className="font-medium">
                  {q ? `Question ${q.position}` : "Question"}
                  {a.points_awarded != null ? ` · ${a.points_awarded} point(s)` : ""}
                </p>
                {q ? <p className="mt-0.5 italic text-muted-foreground">{q.prompt}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm">{a.feedback}</p>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
