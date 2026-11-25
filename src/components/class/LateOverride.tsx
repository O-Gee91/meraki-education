import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LateFields = {
  id: string;
  is_late?: boolean | null;
  late_override_by?: string | null;
  late_override_at?: string | null;
  late_override_reason?: string | null;
  late_penalty_override_pct?: number | null;
};

function useOverriderName(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["profile-name", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return "a teacher";
      const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      return data?.full_name?.trim() || "a teacher";
    },
  });
}

/** Small badge shown on any submission whose late status a teacher changed. */
export function LateOverrideBadge({ submission }: { submission: LateFields }) {
  const { data: name } = useOverriderName(submission.late_override_by);
  if (!submission.late_override_at) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
      title={submission.late_override_reason ?? undefined}
    >
      <ShieldCheck className="h-3 w-3" />
      Late status overridden by {name ?? "…"}
    </span>
  );
}

/** Teacher/admin control: shows late status and lets staff override it. */
export function LateOverrideControl({ submission, assignmentId }: { submission: LateFields; assignmentId: string }) {
  const { isStaff } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const isLate = Boolean(submission.is_late);
  const [onTime, setOnTime] = useState(!isLate);
  const [reason, setReason] = useState("");

  const changing = onTime === isLate;
  const reasonMissing = changing && reason.trim().length === 0;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("override_late_status", {
        _submission_id: submission.id,
        _on_time: onTime,
        _reason: reason.trim() || null,
        // Retain legacy audit metadata; this control changes lateness, not scores.
        _penalty_pct: submission.late_penalty_override_pct ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(onTime ? "Marked as on time" : "Kept as late");
      qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isLate && !submission.late_override_at) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLate ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
          <Clock className="h-3 w-3" /> Late
        </span>
      ) : null}
      <LateOverrideBadge submission={submission} />
      {isStaff ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOnTime(!isLate);
            setReason("");
            setOpen(true);
          }}
        >
          Override Late Status
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override late status</DialogTitle>
            <DialogDescription>Every change is recorded in the audit log. Scores stay unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{onTime ? "Mark as on-time" : "Keep as late"}</p>
                <p className="text-xs text-muted-foreground">Currently {isLate ? "late" : "on time"}</p>
              </div>
              <Switch checked={onTime} onCheckedChange={setOnTime} aria-label="Mark as on-time" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="late-reason">Reason{changing ? " (required)" : " (optional)"}</Label>
              <Textarea id="late-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Excused absence on the due date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={reasonMissing || save.isPending} onClick={() => save.mutate()}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
