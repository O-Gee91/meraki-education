import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  criterionEarned,
  criterionMax,
  criterionWeight,
  levelMax,
  levelMin,
  levelOptions,
  parseCriteria,

  parseSelections,
  rubricTotal,
  scaleToAssignment,
  selectionsTotal,
  type RubricSelections,
} from "@/lib/rubrics";
import { cn } from "@/lib/utils";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";

export function RubricScorePanel({
  assignmentId,
  rubricId,
  studentId,
  pointsPossible,
  readOnly = false,
}: {
  assignmentId: string;
  rubricId: string;
  studentId: string;
  pointsPossible: number;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const draftKey = `rubric-comment:${assignmentId}:${studentId}`;
  const restoredDraft = useRef(readDraft<string>(draftKey));
  const commentEdited = useRef(restoredDraft.current != null);
  const [selections, setSelections] = useState<RubricSelections>({});
  const [comment, setComment] = useState(restoredDraft.current ?? "");

  const { data: rubric } = useQuery({
    queryKey: ["rubric", rubricId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubrics")
        .select("id, title, description, criteria, total_points")
        .eq("id", rubricId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["rubric-score", assignmentId, studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubric_scores")
        .select("selections, comment, points_earned")
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setSelections(parseSelections(existing?.selections));
    if (!commentEdited.current) setComment(existing?.comment ?? "");
  }, [existing]);

  const commentDirty = comment.trim() !== (existing?.comment ?? "").trim();
  const commentDraft = useAutosaveDraft(draftKey, comment, {
    enabled: !readOnly,
    dirty: commentDirty,
  });

  const criteria = parseCriteria(rubric?.criteria);
  const max = rubric ? Number(rubric.total_points) || rubricTotal(criteria) : 0;
  const earned = selectionsTotal(criteria, selections);
  const scaled = scaleToAssignment(earned, max, pointsPossible);

  const save = useMutation({
    mutationFn: async () => {
      const stamp = new Date().toISOString();
      const { error } = await supabase.from("rubric_scores").upsert(
        {
          assignment_id: assignmentId,
          student_id: studentId,
          rubric_id: rubricId,
          selections: selections as unknown as never,
          points_earned: earned,
          comment: comment.trim() || null,
          graded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          updated_at: stamp,
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;

      const gradeRow: {
        assignment_id: string;
        student_id: string;
        points_earned: number;
        updated_at: string;
        comment?: string;
      } = {
        assignment_id: assignmentId,
        student_id: studentId,
        points_earned: scaled,
        updated_at: stamp,
      };
      if (comment.trim()) gradeRow.comment = comment.trim();
      const { error: gradeErr } = await supabase.from("grades").upsert(
        gradeRow,
        { onConflict: "assignment_id,student_id" },
      );
      if (gradeErr) throw gradeErr;
    },
    onSuccess: () => {
      toast.success("Rubric score saved");
      commentEdited.current = false;
      commentDraft.clear();
      queryClient.invalidateQueries({ queryKey: ["rubric-score", assignmentId, studentId] });
      queryClient.invalidateQueries({ queryKey: ["assignment-grades", assignmentId] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!rubric) return null;

  if (criteria.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        This rubric has no rows yet.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{rubric.title}</p>
        <Badge variant="secondary">
          {earned}/{max} · {scaled} of {pointsPossible} points
        </Badge>
      </div>

      <div className="mt-2 space-y-2">
        {criteria.map((c) => (
          <div key={c.id} className="rounded-md border border-border/70 bg-background p-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {c.title || "Untitled row"}
                {criterionWeight(c) !== 1 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ×{criterionWeight(c)}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {criterionEarned(c, selections)}/{criterionMax(c)}
              </span>
            </div>
            {c.description && (
              <p className="text-xs text-muted-foreground">{c.description}</p>
            )}
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {c.levels.map((lv, li) => {
                const options = levelOptions(lv);
                const picked = Number(selections[c.id]);
                const active =
                  Number.isFinite(picked) &&
                  picked >= levelMin(lv) &&
                  picked <= levelMax(lv);
                const showing = active ? picked : options[0];

                return (
                  <button
                    key={li}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      setSelections((s) => {
                        const current = s[c.id];
                        const inRange =
                          Number.isFinite(current) &&
                          Number(current) >= levelMin(lv) &&
                          Number(current) <= levelMax(lv);
                        if (!inRange) return { ...s, [c.id]: options[0] as number };
                        const at = options.indexOf(Number(current));
                        const next = options[(at + 1) % options.length] as number;
                        return { ...s, [c.id]: next };
                      });
                    }}
                    className={cn(
                      "rounded-md border p-2 text-left text-xs transition",
                      active
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-secondary/50",
                      readOnly && "cursor-default hover:bg-transparent",
                    )}
                  >
                    <span className="font-medium">
                      {lv.label} ·{" "}
                      {options.length > 1 ? (
                        <>
                          {showing}{" "}
                          <span className="font-normal text-muted-foreground">
                            (of {levelMin(lv)}–{levelMax(lv)})
                          </span>
                        </>
                      ) : (
                        options[0]
                      )}
                    </span>
                    {options.length > 1 && !readOnly && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Click again to change the points
                      </span>
                    )}
                    {lv.descriptor && (
                      <span className="mt-0.5 block text-muted-foreground">
                        {lv.descriptor}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

          </div>
        ))}
      </div>

      {readOnly ? (
        comment ? (
          <p className="mt-2 text-xs text-muted-foreground">Teacher comment: {comment}</p>
        ) : null
      ) : (
        <>
          <Textarea
            className="mt-2 min-h-16 text-sm"
            placeholder="Comment for this student (optional)"
            value={comment}
            maxLength={2000}
            onChange={(e) => {
              commentEdited.current = true;
              setComment(e.target.value);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save rubric score"}
            </Button>
            <DraftStatus
              state={commentDraft.state}
              savedAt={commentDraft.savedAt}
              dirty={commentDirty}
            />
          </div>
        </>
      )}
    </div>
  );
}
