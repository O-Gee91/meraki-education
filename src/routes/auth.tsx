import { useEffect, useState } from "react";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { needsSecondFactor } from "@/lib/mfa-client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  identifierToEmail,
  isValidUsername,
  looksLikeEmail,
  normalizeUsername,
  usernameToEmail,
  USERNAME_RULES,
} from "@/lib/usernames";
import { recordLogin } from "@/lib/login-tracking";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Meraki Education Platform" },
      {
        name: "description",
        content:
          "Sign in or create an account to reach your Meraki Education gradebook, attendance, messages and class information.",
      },
      { property: "og:title", content: "Sign in — Meraki Education Platform" },
      {
        property: "og:description",
        content: "Teacher, student, guardian and admin access to the Meraki Education school platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s["next"] === "string" ? { next: s["next"] } : {},
  component: AuthPage,
});

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

/** School staff email domains that may claim educator access (ssbs, ssbs2, ssbs3). */
const SCHOOL_STAFF_EMAIL_RE = /@([a-z0-9-]+\.)*ssbs[0-9]?(\.[a-z0-9.-]+)?$/i;


function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const returnTo = safeNext(next);

  function goToApp() {
    if (returnTo) {
      window.location.href = returnTo;
      return;
    }
    navigate({ to: "/dashboard" });
  }
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role] = useState("educator");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [staffNote, setStaffNote] = useState("");
  const [pendingApproval, setPendingApproval] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);

  // Returning with a password-only session on an account with 2FA: ask for the code.
  useEffect(() => {
    void needsSecondFactor().then((need) => need && setMfaStep(true));
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const parsedPassword = passwordSchema.safeParse(password);
    if (!identifier.trim()) {
      toast.error("Enter your username");
      return;
    }
    if (!parsedPassword.success) {
      toast.error(parsedPassword.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: identifierToEmail(identifier),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Confirm the session is readable before leaving this page — otherwise the
    // dashboard's sign-in check can run before the session has synced and
    // bounce straight back here.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (await needsSecondFactor()) {
      setMfaStep(true);
      return;
    }
    await recordLogin();
    goToApp();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const parsedPassword = passwordSchema.safeParse(password);
    const normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) {
      toast.error(`Choose a valid username — ${USERNAME_RULES}`);
      return;
    }
    if (!parsedPassword.success) {
      toast.error(parsedPassword.error.issues[0]?.message ?? "Check your details");
      return;
    }
    if (fullName.trim().length < 2) {
      toast.error("Enter your full name");
      return;
    }
    const contactEmail = identifier.trim().toLowerCase();
    if (!looksLikeEmail(contactEmail)) {
      toast.error("Enter the email address where you want notifications sent");
      return;
    }
    const isEducator = true;
    const staffDomain = SCHOOL_STAFF_EMAIL_RE.test(contactEmail);

    if (isEducator && !staffDomain && staffNote.trim().length < 10) {
      toast.error(
        "Tell the administrator who you are and why you need staff access (at least 10 characters).",
      );
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      // Educators sign in with their verified school email so staff access can be trusted.
      email: isEducator ? contactEmail : usernameToEmail(normalized),
      password,
      options: {
        emailRedirectTo: returnTo
          ? `${window.location.origin}${returnTo}`
          : window.location.origin,
        data: {
          full_name: fullName.trim(),
          // SECURITY: `role` here is only a signup hint consumed once by the
          // account-creation trigger. It lives in user metadata, which any
          // signed-in user can rewrite via supabase.auth.updateUser(), so it
          // must never be used for authorization. Authorization is always read
          // from the RLS-protected user_roles table (has_role/is_admin/is_staff).
          role,
          username: normalized,
          contact_email: contactEmail,
          staff_note: isEducator && !staffDomain ? staffNote.trim() : "",
        },
      },
    });

    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (isEducator && !staffDomain) {
      setPendingApproval(true);
      return;
    }
    if (!data.session) {
      setPendingConfirm(true);
      return;
    }
    goToApp();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
          <Link to="/" className="inline-flex items-center gap-2 text-foreground">
            <GraduationCap className="size-6 text-primary" />
            <span className="font-display text-lg font-semibold">Meraki Education</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-6 py-10 sm:py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-normal">Welcome to Meraki</h1>
        </div>
        <div className="min-w-0">
          {mfaStep ? (
            <MfaChallenge
              onDone={() => {
                setMfaStep(false);
                void recordLogin();
                goToApp();
              }}
              onCancel={async () => {
                await supabase.auth.signOut();
                setMfaStep(false);
              }}
            />
          ) : pendingApproval ? (
            <div className="panel p-6 text-center">
              <h2 className="text-xl font-semibold tracking-normal">Waiting for administrator approval</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Your account was created, but staff access from an email outside the approved
                school domains has to be approved by a school administrator. You will be able to
                use teacher tools as soon as your request is approved.
              </p>
              <Button className="mt-6" variant="outline" onClick={() => setPendingApproval(false)}>
                Back to sign in
              </Button>
            </div>
          ) : pendingConfirm ? (
            <div className="panel p-6 text-center">
              <h2 className="text-xl font-semibold tracking-normal">Check your email</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Your account needs confirmation before you can sign in. Ask a school administrator
                if you need help.
              </p>
              <Button className="mt-6" variant="outline" onClick={() => setPendingConfirm(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="h-11 w-full">
                <TabsTrigger className="flex-1" value="signin">
                  Sign in
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="signup">
                  Create account
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="mt-6 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="identifier">Username or email</Label>
                    <Input
                      id="identifier"
                      className="h-11 bg-card"
                      autoComplete="username"
                      value={identifier}
                      maxLength={255}
                      placeholder="ava.chen"
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      className="h-11 bg-card"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      maxLength={72}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>Need help? Ask your teacher or school administrator.</span>
                    <Link to="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Button type="submit" className="h-11 w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    By signing in you agree to the{" "}
                    <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</Link> and{" "}
                    <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      className="h-11 bg-card"
                      autoComplete="name"
                      value={fullName}
                      maxLength={100}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
                      className="h-11 bg-card"
                      autoComplete="username"
                      value={username}
                      maxLength={30}
                      placeholder="ava.chen"
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{USERNAME_RULES}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      className="h-11 bg-card"
                      type="email"
                      autoComplete="email"
                      value={identifier}
                      maxLength={255}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Messages sent to you in Meraki are also delivered to this inbox.
                    </p>
                  </div>
                  {!SCHOOL_STAFF_EMAIL_RE.test(identifier.trim().toLowerCase()) ? (
                    <div className="order-1 space-y-2 sm:col-span-2">
                      <Label htmlFor="staff-note">Why do you need staff access?</Label>
                      <Textarea
                        id="staff-note"
                        className="bg-card"
                        value={staffNote}
                        maxLength={500}
                        rows={3}
                        placeholder="e.g. Grade 7 English teacher, starting this term — approved by Ms. Chen"
                        onChange={(e) => setStaffNote(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      className="h-11 bg-card"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      maxLength={72}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <p className="order-2 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                    Educator accounts only. Students and guardians receive logins from school.
                    Confirm an ssbs, ssbs2 or ssbs3 email for teacher access; other emails need administrator approval.
                  </p>
                  <Button type="submit" className="order-3 h-11 w-full sm:col-span-2" disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
