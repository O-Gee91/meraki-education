import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { ResetAccess } from "./ResetAccess";

type Props = {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    guardian_email: string | null;
    user_id?: string | null;
    guardian_user_id?: string | null;
  };
};

export function CreateLogins({ student }: Props) {
  const queryClient = useQueryClient();
  const provision = useServerFn(provisionStudentAccounts);
  const [open, setOpen] = useState(false);
  const [studentUsername, setStudentUsername] = useState(
    suggestUsername(student.first_name, student.last_name),
  );
  const [guardianUsername, setGuardianUsername] = useState(
    `${suggestUsername(student.first_name, student.last_name)}.parent`.slice(0, 30),
  );
  const [studentEmail, setStudentEmail] = useState("");
  // Left blank on purpose — students/parents register their own email at first sign-in.
  const [guardianEmail, setGuardianEmail] = useState("");
  const [mode, setMode] = useState<"both" | "student" | "parent">("both");
  const [resetExisting, setResetExisting] = useState(false);
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);
  const wantsStudent = mode !== "parent";
  const wantsGuardian = mode !== "student";


  const run = useMutation({
    mutationFn: async () => {
      if (wantsStudent && !wantsGuardian && !studentUsername.trim())
        throw new Error("Enter a student username");
      if (wantsGuardian && !wantsStudent && !guardianUsername.trim())
        throw new Error("Enter a parent / guardian username");
      if (!studentUsername.trim() && !guardianUsername.trim())
        throw new Error("Enter a student or guardian username");

      const result = await provision({
        data: {
          entries: [
            {
              student_id: student.id,
              first_name: student.first_name,
              last_name: student.last_name,
              // Existing accounts are matched by id so a new username never
              // creates a second account for the same person.
              student_username:
                !wantsStudent || student.user_id ? null : studentUsername.trim() || null,
              student_email: wantsStudent ? studentEmail.trim() || null : null,
              guardian_username:
                !wantsGuardian || student.guardian_user_id
                  ? null
                  : guardianUsername.trim() || null,
              guardian_email: wantsGuardian ? guardianEmail.trim() || null : null,
              student_user_id: wantsStudent ? student.user_id ?? null : null,
              guardian_user_id: wantsGuardian ? student.guardian_user_id ?? null : null,
              reset_existing: resetExisting,
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
        created > 0 ? `Created ${created} login${created === 1 ? "" : "s"}` : "Linked existing accounts",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const name = `${student.first_name} ${student.last_name}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAccounts([]);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {student.user_id || student.guardian_user_id ? "Manage logins" : "Create logins"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Logins for {name}</DialogTitle>
          <DialogDescription>
            Accounts sign in with a username and password. Emails are optional here — anyone
            without one is asked to register their own email the first time they sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Generate logins for</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["both", "Student + parent"],
                  ["student", "Student only"],
                  ["parent", "Parent only"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={mode === value ? "default" : "outline"}
                  onClick={() => setMode(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {wantsStudent ? (
            <div className="space-y-1.5">
              <Label htmlFor="student-username">Student username</Label>
              <Input
                id="student-username"
                value={studentUsername}
                maxLength={30}
                placeholder="ava.chen"
                onChange={(e) => setStudentUsername(e.target.value)}
              />
            </div>
          ) : null}
          {wantsGuardian ? (
            <div className="space-y-1.5">
              <Label htmlFor="guardian-username">Parent / guardian username</Label>
              <Input
                id="guardian-username"
                value={guardianUsername}
                maxLength={30}
                placeholder="ava.chen.parent"
                onChange={(e) => setGuardianUsername(e.target.value)}
              />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{USERNAME_RULES}</p>
          {wantsStudent ? (
            <div className="space-y-1.5">
              <Label htmlFor="student-login-email">Student email (optional)</Label>
              <Input
                id="student-login-email"
                type="email"
                value={studentEmail}
                maxLength={255}
                placeholder="leave blank — student adds it at first sign-in"
                onChange={(e) => setStudentEmail(e.target.value)}
              />
            </div>
          ) : null}
          {wantsGuardian ? (
            <div className="space-y-1.5">
              <Label htmlFor="guardian-login-email">Parent / guardian email (optional)</Label>
              <Input
                id="guardian-login-email"
                type="email"
                value={guardianEmail}
                maxLength={255}
                placeholder="leave blank — guardian adds it at first sign-in"
                onChange={(e) => setGuardianEmail(e.target.value)}
              />
            </div>
          ) : null}
        </div>



        {student.user_id || student.guardian_user_id ? (
          <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={resetExisting}
              onChange={(e) => setResetExisting(e.target.checked)}
            />
            <span>
              Re-issue a temporary password for the existing account(s)
              <span className="block text-xs text-muted-foreground">
                Prints a new slip and replaces the old password.
              </span>
            </span>
          </label>
        ) : null}

        {accounts.length > 0 ? <AccountResults accounts={accounts} /> : null}

        {student.user_id || student.guardian_user_id ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
            <span className="text-xs text-muted-foreground">Forgotten details?</span>
            {student.user_id ? (
              <ResetAccess
                userId={student.user_id}
                label={`${name} (student)`}
                triggerLabel="Reset student password"
                onDone={() => queryClient.invalidateQueries({ queryKey: ["students"] })}
              />
            ) : null}
            {student.guardian_user_id ? (
              <ResetAccess
                userId={student.guardian_user_id}
                label={`${name}'s guardian`}
                triggerLabel="Reset guardian password"
                onDone={() => queryClient.invalidateQueries({ queryKey: ["students"] })}
              />
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Creating…" : "Create logins"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
