import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { shareResource } from "@/lib/sharing.functions";
import type { SharedKind } from "@/lib/sharing";

const GRADES = [5, 6, 7, 8, 9];

export function ShareResourceButton({
  kind,
  id,
  title,
  defaultGrade,
}: {
  kind: SharedKind;
  id: string;
  title: string;
  defaultGrade?: number | null;
}) {
  const share = useServerFn(shareResource);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(defaultGrade ? String(defaultGrade) : "");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      share({
        data: {
          kind,
          id,
          gradeLevel: grade ? Number(grade) : null,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Shared with teachers in that grade");
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{title}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="share-grade">Share with teachers of</Label>
            <Select value={grade || "any"} onValueChange={(v) => setGrade(v === "any" ? "" : v)}>
              <SelectTrigger id="share-grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All grades</SelectItem>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-note">Note for colleagues (optional)</Label>
            <Textarea
              id="share-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What this covers, how long it takes, anything to watch for…"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Colleagues get their own editable copy — changes they make never touch your original.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Sharing…" : "Share to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
