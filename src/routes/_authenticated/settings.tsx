import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { PasskeysCard } from "@/components/settings/PasskeysCard";
import { MfaSetupGuide } from "@/components/settings/MfaSetupGuide";
import { FeatureFlagsPanel } from "@/components/settings/FeatureFlagsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — Meraki Education Platform" },
      {
        name: "description",
        content: "Manage your Meraki Education password, two-step verification and administrator feature switches.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Account settings — Meraki Education Platform" },
      {
        property: "og:description",
        content: "Manage your Meraki Education password, two-step verification and administrator feature switches.",
      },
    ],
  }),
  component: SettingsPage,
});

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

function SettingsPage() {
  const { user, profile, isStaff } = useAuth();
  const navigate = Route.useNavigate();

  const { data: logins = [] } = useQuery({
    queryKey: ["my-login-events", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_events")
        .select("id, signed_in_at")
        .eq("user_id", user!.id)
        .order("signed_in_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });


  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) {
      toast.error("Enter your current password");
      return;
    }
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your new password");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (next === current) {
      toast.error("Choose a password different from your current one");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: next,
      current_password: current,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("current")
          ? "Your current password was not accepted. Check it and try again."
          : error.message,
      );
      return;
    }
    toast.success("Password updated");
    setCurrent("");
    setNext("");
    setConfirm("");

  }

  return (
    <AppShell
      desktopReview
      title="Account settings"
      description="Your password, two-step verification and passkeys."
    >
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-12">
      <div className="min-w-0 space-y-10">
      <form onSubmit={submit} className="w-full min-w-0 max-w-lg space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {profile?.full_name || user?.email}
            </span>
            .
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            maxLength={72}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-new-password">New password</Label>
          <Input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            maxLength={72}
            onChange={(e) => setNext(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-confirm-password">Confirm new password</Label>
          <Input
            id="settings-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            maxLength={72}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound aria-hidden="true" />
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
      <div className="border-t border-border pt-8">
        <TwoFactorCard suggest={isStaff} />
        <div className="mt-4"><PasskeysCard /></div>
        <div className="mt-3"><MfaSetupGuide /></div>
      </div>
      </div>

      <section aria-labelledby="recent-sign-ins" className="min-w-0 border-t border-border pt-8 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-12">
        <div className="max-w-lg">
        <h2 id="recent-sign-ins" className="text-lg font-semibold">Recent sign-ins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your latest logins to Meraki. If one looks unfamiliar, change your password.
        </p>
        {logins.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No sign-ins recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm">
            {logins.map((l) => (
              <li key={l.id} className="py-3 text-muted-foreground [overflow-wrap:anywhere]">
                <time dateTime={l.signed_in_at}>{new Date(l.signed_in_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>
      </div>
      <FeatureFlagsPanel />
    </AppShell>
  );
}
