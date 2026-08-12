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
  const [guardianEmail, setGuardianEmail] = useState(student.guardian_email ?? "");
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);

  const run = useMutation({
    mutationFn: async () => {
      if (!studentUsername.trim() && !guardianUsername.trim())
        throw new Error("Enter a student or guardian username");
      const result = await provision({
        data: {
          entries: [
            {
              student_id: student.id,
              first_name: student.first_name,
              last_name: student.last_name,
              student_username: studentUsername.trim() || null,
              guardian_username: guardianUsername.trim() || null,
              guardian_email: guardianEmail.trim() || null,
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
            Accounts sign in with a username and password — no email needed. Share the temporary
            password so they can sign in and change it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
          <div className="space-y-1.5">
            <Label htmlFor="guardian-username">Guardian username</Label>
            <Input
              id="guardian-username"
              value={guardianUsername}
              maxLength={30}
              placeholder="ava.chen.parent"
              onChange={(e) => setGuardianUsername(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{USERNAME_RULES}</p>
          <div className="space-y-1.5">
            <Label htmlFor="guardian-login-email">Guardian email (optional, for contact)</Label>
            <Input
              id="guardian-login-email"
              type="email"
              value={guardianEmail}
              maxLength={255}
              placeholder="guardian@example.com"
              onChange={(e) => setGuardianEmail(e.target.value)}
            />
          </div>
        </div>

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
