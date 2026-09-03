import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock } from "lucide-react";
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
        .select("id, status, auto_score, manual_score, total_points, submitted_at")
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
      queryClient.invalidateQueries({ queryKey: ["my-submission", assessmentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limitMinutes = data?.assessment.time_limit_minutes;
  const { remaining, started } = useAssessmentTimer(limitMinutes, assessmentId, () => {
    if (!submit.isPending && !mySubmission) {
      toast.warning("Time is up — your assessment is being submitted automatically.");
      submit.mutate();
    }
  });
  const urgent = remaining != null && remaining <= 60_000;
  const warning = remaining != null && remaining <= 5 * 60_000 && !urgent;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

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
      </div>
    );
  }

  const setResponse = (id: string, next: AnswerResponse) =>
    setResponses((prev) => ({ ...prev, [id]: next }));

  return (
    <div className="space-y-4">
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
                      {q.options.map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value={String(oi)} id={`${q.id}-${oi}`} />
                          {opt}
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                  {q.kind === "multi_select" && (
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => {
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
  );
}
