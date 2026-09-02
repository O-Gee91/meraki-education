import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { provisionStudentAccounts } from "@/lib/roster.functions";
import { suggestUsername } from "@/lib/usernames";
import { AccountResults, type ProvisionedAccount } from "./AccountResults";

function uniqueUsername(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}${n}`.slice(0, 30);
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

export function ClassLogins({
  fixedClassId,
  studentIds,
  disabled,
  triggerLabel = "Print class logins",
}: {
  fixedClassId?: string;
  studentIds?: string[];
  disabled?: boolean;
  triggerLabel?: string;
} = {}) {
  const queryClient = useQueryClient();
  const provision = useServerFn(provisionStudentAccounts);
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(fixedClassId ?? "");
  const [resetExisting, setResetExisting] = useState(false);
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);
  // When the caller hands us a selection, this dialog NEVER falls back to the
  // whole class — even if the ticked rows change while the dialog is open.
  const selectedOnly = studentIds !== undefined;
  const [lockedIds, setLockedIds] = useState<string[]>(studentIds ?? []);




  const { data: classes = [] } = useQuery({
    queryKey: ["classes", "login-slips"],
    enabled: !fixedClassId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level, teacher_name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("Choose a class first");

      let ids: string[];
      if (selectedOnly) {
        ids = lockedIds;
        if (ids.length === 0) throw new Error("Tick at least one student in the roster first");
      } else {
        const { data: enrollments, error: enrErr } = await supabase
          .from("enrollments")
          .select("student_id")
          .eq("class_id", classId);
        if (enrErr) throw enrErr;
        ids = (enrollments ?? []).map((e) => e.student_id);
      }
      if (ids.length === 0) throw new Error("No students are enrolled in this class yet");


      const { data: students, error: stErr } = await supabase
        .from("students")
        .select("id, first_name, last_name, guardian_email, user_id, guardian_user_id")
        .in("id", ids)
        .order("last_name");
      if (stErr) throw stErr;


      const used = new Set<string>();
      const entries = (students ?? []).map((s) => {
        const base = suggestUsername(s.first_name, s.last_name);
        return {
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          student_username: s.user_id ? null : uniqueUsername(base, used),
          student_email: null,
          guardian_username: s.guardian_user_id
            ? null
            : uniqueUsername(`${base}.parent`.slice(0, 27), used),
          // Email stays blank — each person registers their own at first sign-in.
          guardian_email: null,
          student_user_id: s.user_id,
          guardian_user_id: s.guardian_user_id,
          reset_existing: resetExisting,
        };
      });

      const result = await provision({ data: { entries } });
      return result.accounts as ProvisionedAccount[];
    },
    onSuccess: (result) => {
      setAccounts(result);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      const created = result.filter((a) => a.status === "created").length;
      const linked = result.filter((a) => a.status === "linked").length;
      toast.success(
        `Ready: ${created} account${created === 1 ? "" : "s"} created` +
          (linked ? `, ${linked} already existed` : "") +
          " — print the slips below.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Freeze the ticked students at open time so the run can't widen.
          setLockedIds(studentIds ?? []);
        } else {
          setAccounts([]);
          setClassId(fixedClassId ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {selectedOnly
              ? `Login slips for ${lockedIds.length} selected student${lockedIds.length === 1 ? "" : "s"}`
              : "Class login slips"}
          </DialogTitle>

          <DialogDescription>
            {selectedOnly
              ? "Create or re-issue sign-in details for just the students you ticked, then print their slips."
              : fixedClassId
                ? "Create sign-in details for every student (and guardian) in this class who doesn't have an account yet, then print the slips to hand out."
                : "Pick a class to create sign-in details for every student (and guardian) who doesn't have an account yet, then print the slips to hand out."}
          </DialogDescription>
        </DialogHeader>


        {!fixedClassId && (
          <div className="space-y-1.5">
            <Label htmlFor="class-logins-class">Class</Label>
            <select
              id="class-logins-class"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade_level ? ` — Grade ${c.grade_level}` : ""}
                  {c.teacher_name ? ` (${c.teacher_name})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}


        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={resetExisting}
            onChange={(e) => setResetExisting(e.target.checked)}
          />
          <span>
            Re-issue passwords for accounts that already exist
            <span className="block text-xs text-muted-foreground">
              Use this when slips were printed with a mistake —{" "}
              {selectedOnly ? "the selected students" : "everyone in the class"} get a fresh
              temporary password and their old one stops working.
            </span>

          </span>
        </label>

        {accounts.length > 0 ? <AccountResults accounts={accounts} /> : null}

        <DialogFooter>
          <Button onClick={() => run.mutate()} disabled={run.isPending || !classId}>
            {run.isPending ? "Generating…" : "Generate accounts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
