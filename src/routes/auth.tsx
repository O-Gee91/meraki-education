import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
      { title: "Sign in — Meridian Middle School Platform" },
      {
        name: "description",
        content:
          "Sign in or create an account to reach your Meridian gradebook, attendance, messages and tuition information.",
      },
      { property: "og:title", content: "Sign in — Meridian Middle School Platform" },
      {
        property: "og:description",
        content: "Teacher, student, guardian and admin access to the Meridian school platform.",
      },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    if (fullName.trim().length < 2) {
      toast.error("Enter your full name");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim(), role },
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
    navigate({ to: "/dashboard" });
  }

  async function googleSignIn() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });

  }

  return (
    <div className="flex min-h-screen">
      <div className="surface-deep hidden w-2/5 flex-col justify-between p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <GraduationCap className="size-6" />
          <span className="font-display text-lg font-semibold">Meridian</span>
        </Link>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">
            The middle school day, in one place.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-primary-foreground/80">
            Grades, roll, behavior notes, family messages, enrollment and tuition — for teachers,
            students, guardians and admins.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">Grades 6 – 8 · Fall 2026 term</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-3/5">
        <div className="w-full max-w-md">
          {pendingConfirm ? (
            <div className="panel p-6 text-center">
              <h1 className="text-xl font-semibold">Check your email</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium">{email}</span>. Click
                it to finish creating your account, then come back and sign in.
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
                    <Label htmlFor="email">School email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      maxLength={255}
                      onChange={(e) => setEmail(e.target.value)}
                    />
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
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      maxLength={255}
                      onChange={(e) => setEmail(e.target.value)}
                    />
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
