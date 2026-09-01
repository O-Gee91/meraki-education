import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { suggestUsername, USERNAME_RULES } from "@/lib/usernames";
import { AccountResults, type ProvisionedAccount } from "./AccountResults";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One-off account creation for staff: adds a student to the directory and
 * issues student and/or parent logins in a single step (no Excel import).
 */
export function CreateAccount() {
  const queryClient = useQueryClient();
  const provision = useServerFn(provisionStudentAccounts);
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);
  const [form, setForm] = useState({
    first: "",
    last: "",
    chinese: "",
    grade: "7",
    studentNumber: "",
    studentUsername: "",
    guardianUsername: "",
    guardianEmail: "",
    makeStudent: true,
    makeGuardian: true,
  });

  const autoStudent = suggestUsername(form.first, form.last);
  const autoGuardian = `${autoStudent}.parent`.slice(0, 30);

  const run = useMutation({
    mutationFn: async () => {
      const first = form.first.trim();
      const last = form.last.trim();
      if (first.length < 2 || last.length < 2) throw new Error("Enter first and last name");
      const grade = Number(form.grade);
      if (Number.isNaN(grade) || grade < 1 || grade > 12) throw new Error("Grade must be 1–12");
      const guardianEmail = form.guardianEmail.trim().toLowerCase();
      if (guardianEmail && !EMAIL_RE.test(guardianEmail))
        throw new Error("Guardian email looks invalid");
      if (!form.makeStudent && !form.makeGuardian)
        throw new Error("Choose at least one account to create");

      const { data: student, error } = await supabase
        .from("students")
        .insert({
          first_name: first.slice(0, 60),
          last_name: last.slice(0, 60),
          chinese_name: form.chinese.trim().slice(0, 60) || null,
          grade_level: grade,
          student_number: form.studentNumber.trim().slice(0, 20) || null,
          guardian_email: guardianEmail.slice(0, 255) || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const result = await provision({
        data: {
          entries: [
            {
              student_id: student.id,
              first_name: first,
              last_name: last,
              student_username: form.makeStudent
                ? (form.studentUsername.trim() || autoStudent)
                : null,
              guardian_username: form.makeGuardian
                ? (form.guardianUsername.trim() || autoGuardian)
                : null,
              // Emails stay blank on purpose — each person registers their own
              // inbox the first time they sign in.
              student_email: null,
              guardian_email: guardianEmail || null,
            },
          ],
        },
      });
      return result.accounts as ProvisionedAccount[];
    },
    onSuccess: (result) => {
      setAccounts(result);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      const created = result.filter((a) => a.status === "created").length;
      toast.success(
        created > 0
          ? `Created ${created} account${created === 1 ? "" : "s"}`
          : "Student added — no new accounts",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAccounts([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Create account</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a student or parent account</DialogTitle>
          <DialogDescription>
            Adds the student to the directory and issues sign-in details you can print and hand
            out. Emails are left blank — each person registers their own at first sign-in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-first">First name</Label>
              <Input
                id="acct-first"
                value={form.first}
                maxLength={60}
                onChange={(e) => setForm({ ...form, first: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-last">Last name</Label>
              <Input
                id="acct-last"
                value={form.last}
                maxLength={60}
                onChange={(e) => setForm({ ...form, last: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-chinese">Chinese name</Label>
              <Input
                id="acct-chinese"
                value={form.chinese}
                maxLength={60}
                onChange={(e) => setForm({ ...form, chinese: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-grade">Grade level</Label>
              <Input
                id="acct-grade"
                inputMode="numeric"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-number">Student ID</Label>
              <Input
                id="acct-number"
                value={form.studentNumber}
                maxLength={20}
                onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.makeStudent}
              onChange={(e) => setForm({ ...form, makeStudent: e.target.checked })}
            />
            Create a student login
          </label>
          {form.makeStudent ? (
            <div className="space-y-1.5">
              <Label htmlFor="acct-student-username">Student username</Label>
              <Input
                id="acct-student-username"
                value={form.studentUsername}
                maxLength={30}
                placeholder={autoStudent || "ava.chen"}
                onChange={(e) => setForm({ ...form, studentUsername: e.target.value })}
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.makeGuardian}
              onChange={(e) => setForm({ ...form, makeGuardian: e.target.checked })}
            />
            Create a parent / guardian login
          </label>
          {form.makeGuardian ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="acct-guardian-username">Guardian username</Label>
                <Input
                  id="acct-guardian-username"
                  value={form.guardianUsername}
                  maxLength={30}
                  placeholder={autoGuardian || "ava.chen.parent"}
                  onChange={(e) => setForm({ ...form, guardianUsername: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acct-guardian-email">Guardian email (optional)</Label>
                <Input
                  id="acct-guardian-email"
                  type="email"
                  value={form.guardianEmail}
                  maxLength={255}
                  placeholder="leave blank — guardian adds it at first sign-in"
                  onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
                />
              </div>
            </>
          ) : null}

          <p className="text-xs text-muted-foreground">{USERNAME_RULES}</p>
        </div>

        {accounts.length > 0 ? <AccountResults accounts={accounts} /> : null}

        <DialogFooter>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
