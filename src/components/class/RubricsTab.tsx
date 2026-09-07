import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { RubricEditor } from "@/components/class/RubricEditor";
import { copySharedRubric, shareRubric } from "@/lib/rubrics.functions";
import { unshareGradingSetup } from "@/lib/grading-sharing.functions";
import { parseCriteria, rubricTotal, type RubricRow } from "@/lib/rubrics";
import { useAuth } from "@/hooks/useAuth";

const GRADES = [5, 6, 7, 8, 9];

type SharedRubricRow = {
  id: string;
  title: string;
  description: string | null;
  grade_level: number | null;
  payload: unknown;
  shared_by: string | null;
  shared_by_name: string;
  created_at: string;
};

function ShareRubricButton({ rubric, defaultGrade }: { rubric: RubricRow; defaultGrade?: number | null }) {
  const share = useServerFn(shareRubric);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(defaultGrade ? String(defaultGrade) : "");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!grade) throw new Error("Pick the grade this is shared with");
      return share({
        data: {
          rubricId: rubric.id,
          gradeLevel: Number(grade),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Rubric shared with teachers in that grade");
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["shared-rubrics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Share2 className="mr-1 size-4" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{rubric.title}”</DialogTitle>
          <DialogDescription>
            Teachers of that grade get their own editable copy — your original never changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rubric-share-grade">Share with teachers of</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger id="rubric-share-grade">
                <SelectValue placeholder="Choose a grade" />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rubric-share-note">Note for colleagues (optional)</Label>
            <Textarea
              id="rubric-share-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !grade}>
            {mutation.isPending ? "Sharing…" : "Share to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RubricsTab({
  classId,
  gradeLevel,
  subject,
}: {
  classId: string;
  gradeLevel?: number | null;
  subject?: string | null;
}) {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const copy = useServerFn(copySharedRubric);
  const remove = useServerFn(unshareGradingSetup);

  const { data: rubrics = [], isLoading } = useQuery({
    queryKey: ["rubrics", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubrics")
        .select(
          "id, class_id, title, description, grade_level, subject, criteria, total_points, created_by, created_at, updated_at",
        )
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RubricRow[];
    },
  });

  const { data: shared = [] } = useQuery({
    queryKey: ["shared-rubrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_resources")
        .select("id, title, description, grade_level, payload, shared_by, shared_by_name, created_at")
        .eq("kind", "rubric")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SharedRubricRow[];
    },
  });

  const useShared = useMutation({
    mutationFn: async (resourceId: string) => copy({ data: { resourceId, classId } }),
    onSuccess: () => {
      toast.success("Rubric copied into this class");
      queryClient.invalidateQueries({ queryKey: ["rubrics", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unshare = useMutation({
    mutationFn: async (resourceId: string) => remove({ data: { resourceId } }),
    onSuccess: () => {
      toast.success("Removed from the shared library");
      queryClient.invalidateQueries({ queryKey: ["shared-rubrics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRubric = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rubrics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rubric deleted");
      queryClient.invalidateQueries({ queryKey: ["rubrics", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Rubrics for this class</h3>
            <p className="text-sm text-muted-foreground">
              Build a rubric or upload one you already have, then attach it to any piece of
              coursework to score students row by row.
            </p>
          </div>
          <RubricEditor classId={classId} gradeLevel={gradeLevel} subject={subject} />
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading rubrics…</p>
        ) : rubrics.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No rubrics yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rubrics.map((r) => {
              const criteria = parseCriteria(r.criteria);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {criteria.length} rows ·{" "}
                      {Number(r.total_points) || rubricTotal(criteria)} points
                      {r.grade_level ? ` · Grade ${r.grade_level}` : ""}
                    </p>
                    {r.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                  <RubricEditor
                    classId={classId}
                    gradeLevel={gradeLevel}
                    subject={subject}
                    rubric={r}
                    triggerVariant="outline"
                  />
                  <ShareRubricButton rubric={r} defaultGrade={gradeLevel ?? null} />
                  <ConfirmDeleteButton
                    label="Delete"
                    disabled={deleteRubric.isPending}
                    warningTitle="Delete this rubric?"
                    warningDescription="Coursework using it keeps the scores already saved, but the rubric will no longer be available."
                    title={`Delete "${r.title}"?`}
                    description="This cannot be undone."
                    onConfirm={() => deleteRubric.mutate(r.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="panel p-5">
        <h3 className="font-semibold">Shared rubrics in your grade</h3>
        <p className="text-sm text-muted-foreground">
          Rubrics colleagues have shared. Copy one in and edit it freely.
        </p>
        {shared.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing shared yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {shared.map((row) => {
              const payload = (row.payload ?? {}) as Record<string, unknown>;
              const criteria = parseCriteria(payload["criteria"]);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.shared_by_name}
                      {row.grade_level ? ` · Grade ${row.grade_level}` : ""} ·{" "}
                      {criteria.length} rows · {rubricTotal(criteria)} points
                    </p>
                    {row.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {criteria.slice(0, 4).map((c) => (
                      <Badge key={c.id} variant="secondary">
                        {c.title || "Row"}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={useShared.isPending}
                    onClick={() => useShared.mutate(row.id)}
                  >
                    <Download className="mr-1 size-4" /> Use in this class
                  </Button>
                  {(isAdmin || (!!user && row.shared_by === user.id)) && (
                    <ConfirmDeleteButton
                      label="Unshare"
                      disabled={unshare.isPending}
                      warningTitle="Remove this shared rubric?"
                      warningDescription="Colleagues will no longer see it. Copies they already made stay with them."
                      title={`Remove "${row.title}" from the shared library?`}
                      description="This cannot be undone."
                      onConfirm={() => unshare.mutate(row.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
