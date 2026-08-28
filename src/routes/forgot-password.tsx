import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <GraduationCap className="size-6 text-primary" />
          <span className="font-display text-lg font-semibold">Meraki Education</span>
        </Link>

        {sent ? (
          <div className="panel p-6 text-center">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              If an account is registered with that address, we sent a link to choose a new
              password. The link works once and expires shortly.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="panel space-y-4 p-6">
            <h1 className="text-xl font-semibold">Forgot your password?</h1>
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
                value={email}
                maxLength={255}
                placeholder="name@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={run.isPending}>
              {run.isPending ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm">
              <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
