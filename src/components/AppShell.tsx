import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  Eye,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/hooks/useAuth";
import { setActingRole } from "@/hooks/useActingRole";
import { setStudentPreviewMode } from "@/hooks/useStudentPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RegisterEmailGate, needsEmailRegistration } from "@/components/RegisterEmailGate";
import { HeroClassGate } from "@/components/HeroClassGate";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

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
  {
    to: "/assignments",
    label: "Assignments",
    studentLabel: "My assignments",
    icon: ClipboardCheck,
    roles: ["student", "parent"],
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

const STAFF_NAV_GROUPS = [
  { label: "Core Teaching", paths: ["/dashboard", "/classes", "/reports"] },
  { label: "Student Support", paths: ["/students", "/wellbeing", "/behavior"] },
  { label: "Communication", paths: ["/messages", "/community", "/files"] },
  { label: "Admin", paths: ["/people"] },
];

export function AppShell({
  title,
  description,
  actions,
  children,
  desktopReview = false,
  breadcrumbContext,
}: {
  title: ReactNode;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  desktopReview?: boolean;
  breadcrumbContext?: { label: string; section: string; onNavigate: () => void };
}) {
  const { profile, primaryRole, user, canSwitchRole, realStaff, previewingStudent } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: unreadMessages = 0 } = useQuery({
    queryKey: ["unread-messages", user?.id],
    enabled: Boolean(user),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
  });

  const items = NAV.filter((item) => item.roles.includes(primaryRole)).map((item) => {
    const base = primaryRole === "student" ? (item.studentLabel ?? item.label) : item.label;
    return {
      ...item,
      label: item.to === "/messages" && unreadMessages > 0 ? `${base} (${unreadMessages})` : base,
    };
  });
  const staffNavigation = desktopReview && (primaryRole === "admin" || primaryRole === "teacher");
  const navGroups = staffNavigation
    ? STAFF_NAV_GROUPS.map((group) => ({ ...group, items: items.filter((item) => group.paths.includes(item.to)) })).filter((group) => group.items.length > 0)
    : [{ label: "", items }];
  const currentItem = items.find((item) => pathname === item.to || pathname.startsWith(item.to + "/"));
  const currentLabel = currentItem?.label ?? (pathname === "/settings" ? "Account settings" : typeof title === "string" ? title : "Class");

  function switchRole(role: "admin" | "teacher") {
    setActingRole(role);
    // Role decides what data and audiences are in scope, so refetch everything.
    void queryClient.invalidateQueries();
  }

  function togglePreview(next: boolean) {
    setStudentPreviewMode(next);
    void queryClient.invalidateQueries();
    navigate({ to: "/dashboard" });
  }

  async function signOut() {
    setStudentPreviewMode(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const [emailSkipped, setEmailSkipped] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem("meraki-email-prompt-skipped") === "1",
  );
  const suggestEmail = !!profile && needsEmailRegistration(profile.email) && !emailSkipped;

  return (
    <div className="flex min-h-screen bg-background">
      {suggestEmail ? (
        <RegisterEmailGate
          onSkip={() => {
            sessionStorage.setItem("meraki-email-prompt-skipped", "1");
            setEmailSkipped(true);
          }}
        />
      ) : primaryRole === "student" ? (
        <HeroClassGate />
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <GraduationCap className="size-6 text-sidebar-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">Meraki Education</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
          {navGroups.map((group) => (
            <div key={group.label} className={cn(staffNavigation && "mb-3 last:mb-0")}>
              {group.label ? <h2 className="mb-1 px-3 text-xs font-medium text-sidebar-foreground/60">{group.label}</h2> : null}
          {group.items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                 aria-current={active ? "page" : undefined}
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
            </div>
          ))}
        </nav>
        <div className="mt-6 rounded-lg bg-sidebar-accent/60 p-3">
          <p className="truncate text-sm font-semibold">
            {profile?.full_name || user?.email || "Signed in"}
          </p>
          <p className="text-xs text-sidebar-foreground/70">{ROLE_LABEL[primaryRole]}</p>
          {canSwitchRole ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
                Working as
              </p>
              <div className="mt-1.5 flex rounded-md bg-sidebar/70 p-0.5">
                {(["admin", "teacher"] as const).map((role) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    key={role}
                    type="button"
                    onClick={() => switchRole(role)}
                    aria-pressed={primaryRole === role}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                      primaryRole === role
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {role === "admin" ? "Admin" : "Teacher"}
                  </Button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-sidebar-foreground/60">
                {primaryRole === "admin"
                  ? "Updates can go school-wide."
                  : "Updates stay scoped to your own classes."}
              </p>
            </div>
          ) : null}
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
        {previewingStudent ? (
          <div role="status" className="sticky top-0 z-40 border-b border-primary/30 bg-primary/10 px-6 py-2 text-sm">
            <div className={cn("flex flex-wrap items-center justify-between gap-3", desktopReview && "mx-auto w-full max-w-6xl")}>
              <span className="flex items-center gap-2">
                <Eye className="size-4 text-primary" />
                <span><strong>Viewing as student</strong> — the demo Student Tester's view. Read-only; real grades and data are untouched.</span>
              </span>
              <Button size="sm" onClick={() => togglePreview(false)}>Exit student view</Button>
            </div>
          </div>
        ) : null}
        <header className="border-b border-border bg-card">
          <div className={cn("flex flex-wrap items-center justify-between gap-4 px-6 py-5", desktopReview && "mx-auto w-full max-w-6xl")}>
          <div className="min-w-0">
            {staffNavigation ? (
              <Breadcrumb className="mb-2">
                <BreadcrumbList className="text-xs">
                  {pathname !== "/dashboard" ? (
                    <>
                      <BreadcrumbItem><BreadcrumbLink asChild><Link to="/dashboard">Overview</Link></BreadcrumbLink></BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  ) : null}
                  {breadcrumbContext ? (
                    <>
                      <BreadcrumbItem><BreadcrumbLink asChild><Link to="/classes">Classes</Link></BreadcrumbLink></BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0"><BreadcrumbLink asChild><Link to={pathname} onClick={breadcrumbContext.onNavigate} className="break-words [overflow-wrap:anywhere]">{breadcrumbContext.label}</Link></BreadcrumbLink></BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem><BreadcrumbPage>{breadcrumbContext.section}</BreadcrumbPage></BreadcrumbItem>
                    </>
                  ) : <BreadcrumbItem><BreadcrumbPage>{currentLabel}</BreadcrumbPage></BreadcrumbItem>}
                </BreadcrumbList>
              </Breadcrumb>
            ) : null}
            <h1 className="break-words text-2xl font-semibold">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
            {canSwitchRole ? (
              <p className={cn("mt-1 text-xs font-medium text-muted-foreground", desktopReview && "lg:hidden")}>
                {primaryRole === "admin"
                  ? "Admin mode · whole school in scope"
                  : "Teacher mode · your classes only"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {realStaff && !previewingStudent ? (
              <Button variant="outline" size="sm" onClick={() => togglePreview(true)}>
                <Eye className="size-4" /> View as student
              </Button>
            ) : null}
            {canSwitchRole ? (
              <div className={cn("flex items-center gap-2", desktopReview && "lg:hidden")}>
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                  Working as
                </span>
                <div className="flex rounded-md border border-border p-0.5">
                  {(["admin", "teacher"] as const).map((role) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={role}
                      type="button"
                      onClick={() => switchRole(role)}
                      aria-pressed={primaryRole === role}
                      className={cn(
                        "rounded px-2 py-1 text-xs font-medium transition-colors",
                        primaryRole === role
                          ? "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {role === "admin" ? "Admin" : "Teacher"}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="lg:hidden">
              <Link to="/settings">Password</Link>
            </Button>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={signOut}>
              Sign out
            </Button>
          </div>
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

        <main className={cn("flex-1 px-6 py-6", desktopReview && "mx-auto w-full max-w-6xl")}>{children}</main>
      </div>
    </div>
  );
}
