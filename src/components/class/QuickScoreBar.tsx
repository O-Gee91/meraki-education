import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import {
  parseGradingSetup,
  quickScoreCellValue,
  type GradingSetup,
  type QuickScore,
} from "@/lib/grading";

/** Loads the class grading setup so quick scores stay in sync with Grading setup. */
export function useClassGradingSetup(classId: string) {
  return useQuery({
    queryKey: ["class-grading-setup", classId],
    queryFn: async (): Promise<GradingSetup> => {
      const { data, error } = await supabase
        .from("classes")
        .select("weights")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return parseGradingSetup(data?.weights);
    },
  });
}

/**
 * One-click scoring buttons for grading screens.
 * Percent quick scores resolve against the item's points; mark-type scores are
 * skipped here because a single grading field only accepts a numeric score.
 */
export function QuickScoreBar({
  classId,
  pointsPossible,
  onPick,
  editable = true,
  label = "Quick score",
}: {
  classId: string;
  pointsPossible: number;
  onPick: (value: string) => void;
  editable?: boolean;
  label?: string;
}) {
  const { data: setup } = useClassGradingSetup(classId);
  const quick = (setup?.quickScores ?? []).filter((q) => q.kind !== "mark");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5" /> {label}
      </span>
      {quick.map((q, i) => (
        <Button
          key={`${q.label}-${i}`}
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          onClick={() => onPick(quickScoreCellValue(q, pointsPossible))}
        >
          {q.label}
        </Button>
      ))}
      {quick.length === 0 && (
        <span className="text-xs text-muted-foreground">None set up yet</span>
      )}
      {editable && setup && <EditQuickScores classId={classId} setup={setup} />}
    </div>
  );
}

function EditQuickScores({ classId, setup }: { classId: string; setup: GradingSetup }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QuickScore[]>(setup.quickScores);

  useEffect(() => setRows(setup.quickScores), [setup.quickScores]);

  const save = useMutation({
    mutationFn: async () => {
      if (rows.some((r) => !r.label.trim())) throw new Error("Every quick score needs a label");
      const next: GradingSetup = { ...setup, quickScores: rows };
      const { error } = await supabase
        .from("classes")
        .update({ weights: next as unknown as never })
        .eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quick scores updated");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["class-grading-setup", classId] });
      queryClient.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function update(index: number, next: QuickScore) {
    setRows(rows.map((r, i) => (i === index ? next : r)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit quick scores</DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {rows.map((q, i) => (
            <div key={i} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  className="h-8"
                  value={q.label}
                  onChange={(e) => update(i, { ...q, label: e.target.value })}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={q.kind}
                  onValueChange={(v) => update(i, { ...q, kind: v as QuickScore["kind"] })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="points">Points</SelectItem>
                    <SelectItem value="mark">Special mark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  className="h-8"
                  value={String(q.value)}
                  onChange={(e) =>
                    update(i, {
                      ...q,
                      value: q.kind === "mark" ? e.target.value : Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove row ${i + 1}`}
                className="h-8 w-8"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRows([...rows, { label: "New score", kind: "percent", value: 100 }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add quick score
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save quick scores
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Standalone "Edit quick scores" trigger for grading toolbars. */
export function QuickScoreEditButton({ classId }: { classId: string }) {
  const { data: setup } = useClassGradingSetup(classId);
  if (!setup) return null;
  return <EditQuickScores classId={classId} setup={setup} />;
}
