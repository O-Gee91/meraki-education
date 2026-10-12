import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, GraduationCap, Mail } from "lucide-react";
import { toast } from "sonner";
import { requestPasswordReset } from "@/lib/password-reset.functions";
import { looksLikeEmail } from "@/lib/usernames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Meraki Education Platform" },
      {
        name: "description",
        content: "Request a password reset link for your Meraki Education account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Forgot password — Meraki Education Platform" },
      {
        property: "og:description",
        content: "Request a password reset link for your Meraki Education account.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const request = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const run = useMutation({
    mutationFn: async () =>
      request({ data: { email: email.trim(), origin: window.location.origin } }),
    onSuccess: () => setSent(true),
    onError: () => {
      // Even unexpected errors show the neutral state to avoid enumeration.
      setSent(true);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      toast.error("Enter the email address registered on your account");
      return;
    }
    run.mutate();
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

        {sent ? (
          <section aria-labelledby="recovery-status" className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <h1 id="recovery-status" className="text-2xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              If an account is registered with that address, we sent a link to choose a new
              password. The link works once and expires shortly.
            </p>
            <Button asChild className="h-11 w-full">
              <Link to="/auth"><ArrowLeft aria-hidden="true" /> Back to sign in</Link>
            </Button>
          </section>
        ) : (
          <form onSubmit={submit} className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <h1 className="text-2xl font-semibold">Forgot your password?</h1>
            <p className="text-sm text-muted-foreground">
              Enter the email address registered on your account and we'll send you a link to
              choose a new password.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                className="h-11 bg-card"
                value={email}
                maxLength={255}
                placeholder="name@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={run.isPending}>
              <Mail aria-hidden="true" />
              {run.isPending ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm">
              <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
