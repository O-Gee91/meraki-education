import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ProofreadMark = {
  id: string;
  code: string;
  symbol: string;
  label: string;
  meaning: string | null;
  sort_order: number;
};

export function useProofreadMarks() {
  return useQuery({
    queryKey: ["proofread-marks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proofread_marks")
        .select("id, code, symbol, label, meaning, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProofreadMark[];
    },
  });
}

const emptyDraft = { code: "", symbol: "", label: "", meaning: "", sort_order: "100" };

export function ManageMarksDialog() {
  const queryClient = useQueryClient();
  const { data: marks = [] } = useProofreadMarks();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const reset = () => {
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const save = useMutation({
    mutationFn: async () => {
      const code = draft.code.trim().toLowerCase();
      const label = draft.label.trim();
      if (!code || !label) throw new Error("Code and name are required");
      const payload = {
        code: code.slice(0, 20),
        symbol: draft.symbol.trim().slice(0, 8),
        label: label.slice(0, 60),
        meaning: draft.meaning.trim().slice(0, 300) || null,
        sort_order: Number(draft.sort_order) || 100,
      };
      if (editingId) {
        const { error } = await supabase
          .from("proofread_marks")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proofread_marks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Mark updated" : "Mark added");
      reset();
      queryClient.invalidateQueries({ queryKey: ["proofread-marks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proofread_marks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mark removed");
      queryClient.invalidateQueries({ queryKey: ["proofread-marks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7">
          Edit marks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Proofreading marks</DialogTitle>
          <DialogDescription>
            The standard set is loaded for you — rename, re-order, remove or add your own marks.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {marks.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border p-2"
            >
              <div className="flex items-start gap-3">
                <span className="min-w-8 rounded bg-secondary px-1.5 py-0.5 text-center font-mono text-sm">
                  {m.symbol || m.code}
                </span>
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.meaning}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(m.id);
                    setDraft({
                      code: m.code,
                      symbol: m.symbol ?? "",
                      label: m.label,
                      meaning: m.meaning ?? "",
                      sort_order: String(m.sort_order),
                    });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => remove.mutate(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {editingId ? "Edit mark" : "Add a mark"}
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="mark-symbol">Symbol</Label>
              <Input
                id="mark-symbol"
                value={draft.symbol}
                onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                placeholder="¶"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mark-code">Code</Label>
              <Input
                id="mark-code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="sp"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mark-label">Name</Label>
              <Input
                id="mark-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Spelling"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mark-meaning">What it tells the student</Label>
            <Textarea
              id="mark-meaning"
              rows={2}
              value={draft.meaning}
              onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mark-order">Order</Label>
              <Input
                id="mark-order"
                className="w-24"
                inputMode="numeric"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              {editingId ? "Save changes" : "Add mark"}
            </Button>
            {editingId ? (
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
