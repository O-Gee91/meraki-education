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
  triggerLabel = "Print class logins",
}: {
  fixedClassId?: string;
  triggerLabel?: string;
} = {}) {
  const queryClient = useQueryClient();
  const provision = useServerFn(provisionStudentAccounts);
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(fixedClassId ?? "");
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);


  const { data: classes = [] } = useQuery({
    queryKey: ["classes", "login-slips"],
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

      const { data: enrollments, error: enrErr } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("class_id", classId);
      if (enrErr) throw enrErr;
      const ids = (enrollments ?? []).map((e) => e.student_id);
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
          guardian_email: s.guardian_user_id ? null : s.guardian_email,
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
        if (!next) {
          setAccounts([]);
          setClassId("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Print class logins</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Class login slips</DialogTitle>
          <DialogDescription>
            Pick a class to create sign-in details for every student (and guardian) who doesn't
            have an account yet, then print the slips to hand out.
          </DialogDescription>
        </DialogHeader>

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
