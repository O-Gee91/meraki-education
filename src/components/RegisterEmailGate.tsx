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
} from "@/components/ui/dialog";
import { registerMyEmail } from "@/lib/profile-email.functions";
import { USERNAME_EMAIL_DOMAIN } from "@/lib/usernames";

/** True when this profile still has no real inbox on file. */
export function needsEmailRegistration(email: string | null | undefined): boolean {
  const value = (email ?? "").trim().toLowerCase();
  return value.length === 0 || value.endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

export function RegisterEmailGate({ onSkip }: { onSkip?: () => void }) {
  const queryClient = useQueryClient();
  const save = useServerFn(registerMyEmail);
  const [email, setEmail] = useState("");

  const submit = useMutation({
    mutationFn: async () => save({ data: { email } }),
    onSuccess: () => {
      toast.success("Email registered — you're all set");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open>
      <DialogContent className="max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Add your email address</DialogTitle>
          <DialogDescription>
            Your account was created with a username, so an email is not required. We strongly
            recommend adding one so messages, grade notices and password resets can reach you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="register-email">Email address</Label>
          <Input
            id="register-email"
            type="email"
            value={email}
            maxLength={255}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Not now
            </Button>
          )}
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !email.trim()}>
            {submit.isPending ? "Saving…" : "Save email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

