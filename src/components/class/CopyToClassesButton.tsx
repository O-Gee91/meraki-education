import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { copyResourceToClasses } from "@/lib/sharing.functions";
import type { SharedKind } from "@/lib/sharing";

type ClassRow = {
  id: string;
  name: string;
  subject: string | null;
  period: string | null;
  term: string;
  grade_level: number | null;
};

export function CopyToClassesButton({
  kind,
  id,
  title,
  classId,
}: {
  kind: SharedKind;
  id: string;
  title: string;
  classId: string;
}) {
  const copy = useServerFn(copyResourceToClasses);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [keepDueDate, setKeepDueDate] = useState(false);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["my-classes-for-copy"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, term, grade_level")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const targets = classes.filter((c) => c.id !== classId);

  const mutation = useMutation({
    mutationFn: async () =>
      copy({ data: { kind, id, classIds: selected, keepDueDate } }),
    onSuccess: (result) => {
      toast.success(
        `Copied into ${result.copied} ${result.copied === 1 ? "class" : "classes"}${
          kind === "assessment" ? " as unpublished drafts" : ""
        }.`,
      );
      setOpen(false);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (cid: string) =>
    setSelected((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Copy to classes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy “{title}” to other classes</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your classes…</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don’t have any other classes to copy this into yet.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {targets.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`copy-${c.id}`}
                    checked={selected.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  <Label htmlFor={`copy-${c.id}`} className="text-sm font-normal">
                    {c.name}
                    <span className="text-muted-foreground">
                      {c.grade_level ? ` · Grade ${c.grade_level}` : ""}
                      {c.period ? ` · Period ${c.period}` : ""} · {c.term}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="copy-keep-due"
              checked={keepDueDate}
              onCheckedChange={(v) => setKeepDueDate(v === true)}
            />
            <Label htmlFor="copy-keep-due" className="text-sm font-normal">
              Keep the same due date
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Each class gets its own independent copy — editing or grading one never affects the
            others.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || selected.length === 0}
          >
            {mutation.isPending
              ? "Copying…"
              : `Copy to ${selected.length || ""} ${selected.length === 1 ? "class" : "classes"}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
