import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  criterionMax,
  parseCriteria,
  parseSelections,
  rubricTotal,
  scaleToAssignment,
  selectionsTotal,
  type RubricSelections,
} from "@/lib/rubrics";
import { cn } from "@/lib/utils";

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
  const [selections, setSelections] = useState<RubricSelections>({});
  const [comment, setComment] = useState("");

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
    setComment(existing?.comment ?? "");
  }, [existing]);

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

      const { error: gradeErr } = await supabase.from("grades").upsert(
        {
          assignment_id: assignmentId,
          student_id: studentId,
          points_earned: scaled,
          comment: comment.trim() || null,
          updated_at: stamp,
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (gradeErr) throw gradeErr;
    },
    onSuccess: () => {
      toast.success("Rubric score saved");
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
              <span className="text-sm font-medium">{c.title || "Untitled row"}</span>
              <span className="text-xs text-muted-foreground">
                {selections[c.id] ?? 0}/{criterionMax(c)}
              </span>
            </div>
            {c.description && (
              <p className="text-xs text-muted-foreground">{c.description}</p>
            )}
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {c.levels.map((lv, li) => {
                const active = selections[c.id] === lv.points;
                return (
                  <button
                    key={li}
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      setSelections((s) => ({ ...s, [c.id]: lv.points }))
                    }
                    className={cn(
                      "rounded-md border p-2 text-left text-xs transition",
                      active
                        ? "border-accent bg-accent/15"
                        : "border-border hover:bg-secondary/50",
                      readOnly && "cursor-default hover:bg-transparent",
                    )}
                  >
                    <span className="font-medium">
                      {lv.label} · {lv.points}
                    </span>
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
            onChange={(e) => setComment(e.target.value)}
          />
          <Button
            size="sm"
            className="mt-2"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save rubric score"}
          </Button>
        </>
      )}
    </div>
  );
}
