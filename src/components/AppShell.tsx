import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  BookOpen,
  FolderOpen,
  ClipboardCheck,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
  Users2,
  LogOut,
  KeyRound,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RegisterEmailGate, needsEmailRegistration } from "@/components/RegisterEmailGate";

type NavItem = {
  to: string;
  label: string;
  studentLabel?: string;
  icon: typeof BookOpen;
  roles: Role[];
};

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["admin", "teacher", "student", "parent"],
  },
  {
    to: "/classes",
    label: "Classes",
    studentLabel: "My classes",
    icon: BookOpen,
    roles: ["admin", "teacher", "student", "parent"],
  },
  {
    to: "/community",
    label: "Community",
    icon: Users2,
    roles: ["admin", "teacher", "parent"],
  },
  {
    to: "/reports",
    label: "Assessment",
    studentLabel: "My grades",
    icon: ClipboardCheck,
    roles: ["admin", "teacher", "student", "parent"],
  },
  {
    to: "/wellbeing",
    label: "Well-being",
    studentLabel: "How I'm doing",
    icon: HeartPulse,
    roles: ["admin", "teacher", "student", "parent"],
  },
  { to: "/students", label: "Students", icon: Users, roles: ["admin", "teacher"] },

  {
    to: "/behavior",
    label: "Behavior",
    studentLabel: "My behavior",
    icon: ShieldCheck,
    roles: ["admin", "teacher", "student", "parent"],
  },
  {
    to: "/messages",
    label: "Messages",
    studentLabel: "My messages",
    icon: MessageSquare,
    roles: ["admin", "teacher", "student", "parent"],
  },
  {
    to: "/files",
    label: "Files",
    icon: FolderOpen,
    roles: ["admin", "teacher", "parent"],
  },
  { to: "/people", label: "People & roles", icon: ShieldCheck, roles: ["admin"] },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "School admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Guardian",
};

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { profile, primaryRole, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((item) => item.roles.includes(primaryRole)).map((item) => ({
    ...item,
    label: primaryRole === "student" ? (item.studentLabel ?? item.label) : item.label,
  }));

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const mustRegisterEmail = !!profile && needsEmailRegistration(profile.email);

  return (
    <div className="flex min-h-screen bg-background">
      {mustRegisterEmail ? <RegisterEmailGate /> : null}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <GraduationCap className="size-6 text-sidebar-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">Meraki Education</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-lg bg-sidebar-accent/60 p-3">
          <p className="truncate text-sm font-semibold">
            {profile?.full_name || user?.email || "Signed in"}
          </p>
          <p className="text-xs text-sidebar-foreground/70">{ROLE_LABEL[primaryRole]}</p>
          <div className="mt-3 flex items-center gap-4">
            <Link
              to="/settings"
              className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80 hover:text-sidebar-primary"
            >
              <KeyRound className="size-3.5" /> Change password
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80 hover:text-sidebar-primary"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button asChild variant="ghost" size="sm" className="lg:hidden">
              <Link to="/settings">Password</Link>
            </Button>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 lg:hidden">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
                pathname.startsWith(item.to)
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
