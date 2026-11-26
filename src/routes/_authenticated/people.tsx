import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminResetMfa, listMfaStatus } from "@/lib/mfa.functions";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { LoadError } from "@/components/LoadError";
import { NotebookEmpty, NotebookLoading } from "@/components/NotebookDecorations";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/query";
import { useAuth, type Role } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResetAccess } from "@/components/students/ResetAccess";
import { StaffRequests } from "@/components/people/StaffRequests";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({
    meta: [
      { title: "People & roles — Meraki Education" },
      {
        name: "description",
        content:
          "Administrators grant teacher, student, guardian and admin access to Meraki accounts.",
      },
      { property: "og:title", content: "People & roles — Meraki Education" },
      {
        property: "og:description",
        content: "Manage who can teach, administer and view records in your school.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PeoplePage,
});

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];
const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin", teacher: "Teacher", student: "Student", parent: "Guardian",
};

type Filter = Role | "all" | "unassigned";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "admin", label: "Administrators" },
  { value: "teacher", label: "Teachers" },
  { value: "student", label: "Students" },
  { value: "parent", label: "Parents / guardians" },
  { value: "unassigned", label: "No role yet" },
];

function PeoplePage() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const mfaStatusFn = useServerFn(listMfaStatus);
  const resetMfaFn = useServerFn(adminResetMfa);
  const { data: mfaOn = new Set<string>() } = useQuery({
    queryKey: ["mfa-status"],
    enabled: isAdmin,
    queryFn: async () => new Set((await mfaStatusFn()).enabled),
  });

  const peopleQuery = useQuery({
    queryKey: ["people", user?.id],
    enabled: isAdmin,
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        fetchAll((from, to) =>
          supabase.from("profiles").select("id, full_name, email, username").order("full_name").order("id").range(from, to),
        ),
        fetchAll((from, to) =>
          supabase.from("user_roles").select("id, user_id, role").order("id").range(from, to),
        ),
      ]);
      return profiles.map((p) => ({
        ...p,
        roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role as Role),
      }));
    },
  });
  const people = peopleQuery.data ?? [];
  const isLoading = peopleQuery.isPending;

  const toggleRole = useMutation({
    mutationFn: async ({
      userId,
      role,
      has,
    }: {
      userId: string;
      role: Role;
      has: boolean;
    }) => {
      if (has) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Access updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="People & roles" description="Administrator access required." desktopReview>
        <p className="text-sm text-muted-foreground">
          Only school administrators can manage roles. Ask your admin for access.
        </p>
      </AppShell>
    );
  }

  const matchesFilter = (p: (typeof people)[number], f: Filter) =>
    f === "all" ? true : f === "unassigned" ? p.roles.length === 0 : p.roles.includes(f);

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.value] = people.filter((p) => matchesFilter(p, f.value)).length;
    return acc;
  }, {});

  const filtered = people.filter((p) => {
    if (!matchesFilter(p, filter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.full_name ?? "").toLowerCase().includes(q) ||
      (p.username ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AppShell
      title="People & roles"
      description="Grant teaching, guardian or administrator access to accounts."
      desktopReview
    >
      <StaffRequests enabled={isAdmin} desktopReview />

      <section className="mt-6 min-w-0 border-t border-border pt-5" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="text-base font-semibold">Accounts</h2>
        <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="people-search">Search accounts</Label>
            <Input
              id="people-search"
              placeholder="Search by name, username or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="people-filter">Access</Label>
            <Select value={filter} onValueChange={(value) => {
              const selected = FILTERS.find((f) => f.value === value);
              if (selected) setFilter(selected.value);
            }}>
              <SelectTrigger id="people-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label} ({counts[f.value] ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {peopleQuery.isError ? "Accounts couldn't be loaded." : isLoading ? "Loading accounts…" : `${filtered.length} of ${people.length} accounts`}
        </p>
        <div className="mt-5 divide-y divide-border">
          {peopleQuery.isError ? (
            <LoadError label="Accounts couldn't be loaded." onRetry={() => void peopleQuery.refetch()} />
          ) : isLoading ? (
            <NotebookLoading className="py-6 text-sm text-muted-foreground">Loading accounts…</NotebookLoading>
          ) : filtered.length === 0 ? (
            <NotebookEmpty className="py-6 text-sm text-muted-foreground">No accounts found.</NotebookEmpty>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                className="grid min-w-0 items-center gap-3 py-4 xl:grid-cols-[minmax(0,1fr)_27rem] xl:gap-6"
              >
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span>{p.full_name || "Unnamed"}</span>
                    {p.id === user?.id ? <Badge variant="secondary">you</Badge> : null}
                    {mfaOn.has(p.id) ? (
                      <Badge variant="outline" className="font-normal">2FA on</Badge>
                    ) : p.roles.some((r) => r === "teacher" || r === "admin") ? (
                      <span className="text-xs font-normal text-muted-foreground">2FA off</span>
                    ) : null}
                    {mfaOn.has(p.id) && p.id !== user?.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs font-normal"
                        onClick={async () => {
                          if (!window.confirm(`Turn off two-step verification for ${p.full_name || "this account"}? They'll get an email and can set it up again.`)) return;
                          try {
                            await resetMfaFn({ data: { userId: p.id } });
                            toast.success("Two-step verification reset");
                            void queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
                          } catch {
                            toast.error("Couldn't reset two-step verification");
                          }
                        }}
                      >
                        Reset 2FA
                      </Button>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.username ? `${p.username} · ` : ""}
                    {p.email ?? "no email on file"}
                  </p>
                </div>
                <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                  <div>
                  {p.id === user?.id ? null : (
                    <ResetAccess
                      userId={p.id}
                      label={p.full_name || (p.username ?? "this account")}
                      currentUsername={p.username}
                      currentEmail={p.email}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ["people"] })}
                    />
                  )}
                  </div>
                  <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Access for ${p.full_name || p.username || "Unnamed account"}`}>
                  {ROLES.map((role) => {
                    const has = p.roles.includes(role);
                    return (
                      <Button
                        key={role}
                        size="sm"
                        variant="ghost"
                        aria-pressed={has}
                        aria-label={`${ROLE_LABELS[role]} access`}
                        title={`${has ? "Remove" : "Grant"} ${ROLE_LABELS[role].toLowerCase()} access`}
                        className="min-w-0 gap-1 px-1 text-xs text-muted-foreground aria-pressed:bg-secondary aria-pressed:text-foreground"
                        disabled={toggleRole.isPending}
                        onClick={() =>
                          toggleRole.mutate({ userId: p.id, role, has })
                        }
                      >
                        <Check className={`size-3 shrink-0 ${has ? "" : "invisible"}`} aria-hidden="true" />
                        {ROLE_LABELS[role]}
                      </Button>
                    );
                  })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
