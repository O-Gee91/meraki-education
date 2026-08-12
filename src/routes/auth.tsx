import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  identifierToEmail,
  isValidUsername,
  looksLikeEmail,
  normalizeUsername,
  usernameToEmail,
  USERNAME_RULES,
} from "@/lib/usernames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s["next"] === "string" ? { next: s["next"] } : {},
  component: AuthPage,
});

/** Only same-origin relative paths may be used as a post-login destination. */
function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

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
  const [role, setRole] = useState("student");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

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
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(normalized),
      password,
      options: {
        emailRedirectTo: returnTo
          ? `${window.location.origin}${returnTo}`
          : window.location.origin,
        data: {
          full_name: fullName.trim(),
          role,
          username: normalized,
          contact_email: contactEmail,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setPendingConfirm(true);
      return;
    }
    goToApp();
  }

  async function googleSignIn() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnTo
        ? `${window.location.origin}${returnTo}`
        : window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    goToApp();

  }

  return (
    <div className="flex min-h-screen">
      <div className="surface-deep hidden w-2/5 flex-col justify-between p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <GraduationCap className="size-6" />
          <span className="font-display text-lg font-semibold">Meraki Education</span>
        </Link>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">
            The whole school day, in one place.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-primary-foreground/80">
            Grades, roll, behavior notes, family messages and reporting — for teachers,
            students, guardians and admins.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">Grades 5 – 9 · Fall 2026 term</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-3/5">
        <div className="w-full max-w-md">
          {pendingConfirm ? (
            <div className="panel p-6 text-center">
              <h1 className="text-xl font-semibold">Check your email</h1>
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
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="signin">
                  Sign in
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="signup">
                  Create account
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="panel mt-4 space-y-4 p-6">
                  <div className="space-y-2">
                    <Label htmlFor="identifier">Username</Label>
                    <Input
                      id="identifier"
                      autoComplete="username"
                      value={identifier}
                      maxLength={255}
                      placeholder="ava.chen"
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Forgot your password? Ask your teacher or a school administrator to reset it.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      maxLength={72}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={googleSignIn}
                  >
                    Continue with Google
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="panel mt-4 space-y-4 p-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={fullName}
                      maxLength={100}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">I am a…</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="parent">Parent / guardian</SelectItem>
                        <SelectItem value="educator">Educator / staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {role === "educator"
                        ? "Educator accounts start with student-level access. A school administrator reviews and grants teaching permissions after signup."
                        : "Teacher and admin access is granted by a school administrator after your account is created."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
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
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      maxLength={72}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={googleSignIn}
                  >
                    Continue with Google
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
