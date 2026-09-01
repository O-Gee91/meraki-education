import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — Meraki Education Platform" },
      {
        name: "description",
        content: "Change your Meraki Education account password.",
      },
      { property: "og:title", content: "Account settings — Meraki Education Platform" },
      {
        property: "og:description",
        content: "Change your Meraki Education account password.",
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
    if (!isStaff) {
      toast("Next: choose your character class on your Overview page to begin your quest.", {
        action: { label: "Choose class", onClick: () => navigate({ to: "/dashboard" }) },
      });
    }
    setCurrent("");
    setNext("");
    setConfirm("");

  }

  return (
    <AppShell
      title="Account settings"
      description="Keep your sign-in details up to date."
    >
      <form onSubmit={submit} className="panel max-w-lg space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {profile?.full_name || user?.email}
            </span>
            . Choose a password of at least 8 characters.
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
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AppShell>
  );
}
