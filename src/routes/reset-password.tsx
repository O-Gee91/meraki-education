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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
          <Link to="/" className="inline-flex min-w-0 items-center gap-2 text-foreground">
            <GraduationCap aria-hidden="true" className="size-6 shrink-0 text-primary" />
            <span className="font-display text-lg font-semibold">Meraki Education</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-6 py-10 sm:py-12">
        {done ? (
          <section
            aria-labelledby="reset-done"
            className="min-w-0 space-y-6 [overflow-wrap:anywhere]"
          >
            <h1 id="reset-done" className="text-2xl font-semibold">
              Password updated
            </h1>
            <p className="text-sm text-muted-foreground">
              Your password has been changed. You can now sign in with it.
            </p>
            <Button asChild className="h-11 w-full">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </section>
        ) : ready ? (
          <form onSubmit={submit} className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <h1 className="text-2xl font-semibold">Choose a new password</h1>
            <p className="text-sm text-muted-foreground">
              Pick a new password for your account. It must be at least 8 characters long.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="h-11 bg-card"
                value={password}
                maxLength={72}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="h-11 bg-card"
                value={confirm}
                maxLength={72}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        ) : (
          <section
            aria-labelledby="reset-needed"
            className="min-w-0 space-y-6 [overflow-wrap:anywhere]"
          >
            <h1 id="reset-needed" className="text-2xl font-semibold">
              Reset link needed
            </h1>
            <p className="text-sm text-muted-foreground">
              This page only works from a password reset link. Request a new one if yours has
              expired.
            </p>
            <Button asChild className="h-11 w-full">
              <Link to="/forgot-password">Request a reset link</Link>
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
