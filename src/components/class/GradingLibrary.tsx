import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Share2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  applySharedGradingSetup,
  shareGradingSetup,
} from "@/lib/grading-sharing.functions";
import { parseGradingSetup } from "@/lib/grading";

type SharedGradingRow = {
  id: string;
  title: string;
  description: string | null;
  grade_level: number | null;
  subject: string | null;
  payload: unknown;
  shared_by: string | null;
  shared_by_name: string;
  created_at: string;
};

export function GradingLibrary({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const queryClient = useQueryClient();
  const share = useServerFn(shareGradingSetup);
  const apply = useServerFn(applySharedGradingSetup);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`${className} grading setup`);
  const [note, setNote] = useState("");

  const { data: shared = [], isLoading } = useQuery({
    queryKey: ["shared-grading-setups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_resources")
        .select(
          "id, title, description, grade_level, subject, payload, shared_by, shared_by_name, created_at",
        )
        .eq("kind", "grading")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SharedGradingRow[];
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Give the setup a name");
      return share({ data: { classId, title: title.trim(), note: note.trim() } });
    },
    onSuccess: () => {
      toast.success("Grading setup shared with other teachers");
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["shared-grading-setups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unshare = useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await supabase
        .from("shared_resources")
        .delete()
        .eq("id", resourceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shared grading setup removed");
      queryClient.invalidateQueries({ queryKey: ["shared-grading-setups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const useSetup = useMutation({
    mutationFn: async (resourceId: string) =>
      apply({ data: { resourceId, classIds: [classId] } }),
    onSuccess: () => {
      toast.success("Grading setup applied to this class");
      queryClient.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Shared grading setups</h3>
          <p className="text-sm text-muted-foreground">
            Publish this class's scale, marks and categories so other teachers can reuse
            it — or pull in a setup someone else shared.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Share2 className="mr-1 size-4" /> Share this setup
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share grading setup</DialogTitle>
              <DialogDescription>
                Teachers of the same grade (and admins) can apply a copy to their own
                classes. Later edits to your class do not change their copy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="grading-share-title">Name</Label>
                <Input
                  id="grading-share-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="grading-share-note">Note (optional)</Label>
                <Textarea
                  id="grading-share-note"
                  value={note}
                  placeholder="How this setup is meant to be used"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
                {publish.isPending ? "Sharing…" : "Share setup"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading shared setups…</p>
      ) : shared.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No shared grading setups yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shared.map((row) => {
            const setup = parseGradingSetup(row.payload);
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
                    {setup.mode === "weighted" ? "Weighted" : "Unweighted"} ·{" "}
                    {setup.categories.length} categories · {setup.scale.length} bands
                  </p>
                  {row.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {setup.scale.slice(0, 5).map((b) => (
                    <Badge key={b.letter} variant="secondary">
                      {b.letter} {b.min}+
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={useSetup.isPending}
                  onClick={() => useSetup.mutate(row.id)}
                >
                  <Download className="mr-1 size-4" /> Use in this class
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
