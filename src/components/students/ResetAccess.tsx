import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { resetStudentAccess } from "@/lib/accounts.functions";
import { USERNAME_RULES } from "@/lib/usernames";

type Props = {
  userId: string;
  label: string;
  currentUsername?: string | null;
  currentEmail?: string | null;
  triggerLabel?: string;
  onDone?: () => void;
};

export function ResetAccess({
  userId,
  label,
  currentUsername,
  currentEmail,
  triggerLabel,
  onDone,
}: Props) {
  const reset = useServerFn(resetStudentAccess);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{
    username: string | null;
    email: string;
    password: string;
  } | null>(null);

  const run = useMutation({
    mutationFn: async () =>
      reset({
        data: {
          user_id: userId,
          new_username: username.trim() || null,
          new_email: email.trim() || null,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      toast.success("New temporary password generated");
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setUsername("");
          setEmail("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {triggerLabel ?? "Reset password"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset access for {label}</DialogTitle>
          <DialogDescription>
            A new temporary password is generated and shown once — copy it and share it with the
            student or guardian. They can change it after signing in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor={`reset-username-${userId}`}>Username</Label>
          <Input
            id={`reset-username-${userId}`}
            value={username}
            maxLength={30}
            placeholder={currentUsername ?? "leave blank to keep current"}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to keep the current username. {USERNAME_RULES}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`reset-email-${userId}`}>Notification email</Label>
          <Input
            id={`reset-email-${userId}`}
            type="email"
            value={email}
            maxLength={255}
            placeholder={currentEmail ?? "name@example.com"}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to keep the current address. Messages are delivered here as well as in the
            site.
          </p>
        </div>

        {result ? (
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
            <p>
              Username: <span className="font-mono">{result.username ?? result.email}</span>
            </p>
            <p className="mt-1">
              Temporary password: <span className="font-mono">{result.password}</span>
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Resetting…" : "Generate new password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
