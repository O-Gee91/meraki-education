import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Meraki Education Platform" },
      {
        name: "description",
        content: "Set a new password for your Meraki Education account.",
      },
      { property: "og:title", content: "Choose a new password — Meraki Education Platform" },
      {
        property: "og:description",
        content: "Set a new password for your Meraki Education account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The recovery link lands here with #access_token=...&type=recovery; the
    // Supabase client exchanges it for a recovery session automatically.
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your password");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <GraduationCap className="size-6 text-primary" />
          <span className="font-display text-lg font-semibold">Meraki Education</span>
        </Link>

        {done ? (
          <div className="panel p-6 text-center">
            <h1 className="text-xl font-semibold">Password updated</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your password has been changed. You can now sign in with it.
            </p>
            <Button asChild className="mt-6">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </div>
        ) : ready ? (
          <form onSubmit={submit} className="panel space-y-4 p-6">
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                maxLength={72}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                maxLength={72}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        ) : (
          <div className="panel p-6 text-center">
            <h1 className="text-xl font-semibold">Reset link needed</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This page only works from a password reset link. Request a new one if yours has
              expired.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/forgot-password">Request a reset link</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
