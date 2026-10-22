import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { notifyCourseworkPosted } from "@/lib/coursework-notify.functions";

export type NotifyValue = { students: boolean; parents: boolean };
export const noNotify: NotifyValue = { students: false, parents: false };

export function NotifyChoices({ value, onChange, idPrefix }: { value: NotifyValue; onChange: (v: NotifyValue) => void; idPrefix: string }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Email when published</p>
      <div className="flex items-center gap-2">
        <Checkbox id={`${idPrefix}-ns`} checked={value.students} onCheckedChange={(v) => onChange({ ...value, students: v === true })} />
        <Label htmlFor={`${idPrefix}-ns`} className="text-sm font-normal">Email students</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`${idPrefix}-np`} checked={value.parents} onCheckedChange={(v) => onChange({ ...value, parents: v === true })} />
        <Label htmlFor={`${idPrefix}-np`} className="text-sm font-normal">Email parents &amp; guardians</Label>
      </div>
      <p className="text-xs text-muted-foreground">Only people with an email address on file are emailed. Test accounts are skipped.</p>
    </div>
  );
}

/** Sends the emails in the background and reports the result as a toast. */
export function useNotifyCoursework() {
  const fn = useServerFn(notifyCourseworkPosted);
  return (kind: "assignment" | "assessment", ids: string[], v: NotifyValue) => {
    if (!ids.length || (!v.students && !v.parents)) return;
    const t = toast.loading("Sending email notifications…");
    fn({ data: { kind, ids, ...v } })
      .then((r) => {
        const parts = [
          v.students ? `${r.students} student${r.students === 1 ? "" : "s"}` : null,
          v.parents ? `${r.parents} parent${r.parents === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        toast.success(`Notified ${parts.join(" & ")}`, { id: t });
      })
      .catch(() => toast.error("Published, but the emails couldn't be sent", { id: t }));
  };
}

/** Confirmation shown when publishing an existing draft. */
export function PublishNotifyDialog({
  open, onOpenChange, title, onConfirm, pending,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; onConfirm: (v: NotifyValue) => void; pending?: boolean }) {
  const [value, setValue] = useState<NotifyValue>(noNotify);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setValue(noNotify); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish "{title}"?</DialogTitle>
          <DialogDescription>Students will see it right away.</DialogDescription>
        </DialogHeader>
        <NotifyChoices value={value} onChange={setValue} idPrefix="publish" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => { onConfirm(value); setValue(noNotify); }}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
