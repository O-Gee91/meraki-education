import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
          <span className="inline-flex min-w-0 items-center gap-2 text-foreground">
            <GraduationCap aria-hidden="true" className="size-6 shrink-0 text-primary" />
            <span className="font-display text-lg font-semibold">Meraki Education</span>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-6 py-10 sm:py-12">
        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
          <h1 className="text-2xl font-semibold">Connection request unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Could not load this authorization request:{" "}
            {String((error as Error)?.message ?? error)}
          </p>
        </div>
      </main>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md min-w-0 [overflow-wrap:anywhere]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <GraduationCap aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span className="font-display text-sm font-semibold">Meraki Education</span>
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Connect {clientName} to your account</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {clientName} will be able to read and act on Meraki Education data as you — the same
          classes, assignments, announcements and calendar you can already see. You can revoke
          access at any time.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="h-11 flex-1">
            {busy ? "Working…" : "Approve"}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => decide(false)}
            className="h-11 flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
