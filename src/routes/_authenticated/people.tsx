import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResetAccess } from "@/components/students/ResetAccess";

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
    ],
  }),
  component: PeoplePage,
});

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];

function PeoplePage() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, username").order("full_name"),
        supabase.from("user_roles").select("id, user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role),
      }));
    },
  });

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
      <AppShell title="People & roles" description="Administrator access required.">
        <p className="text-sm text-muted-foreground">
          Only school administrators can manage roles. Ask your admin for access.
        </p>
      </AppShell>
    );
  }

  const filtered = people.filter((p) => {
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
    >
      <div className="panel p-5">
        <Input
          placeholder="Search by name, username or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <div className="mt-5 divide-y divide-border">
          {isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading accounts…</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold">
                    <span className="truncate">{p.full_name || "Unnamed"}</span>
                    {p.id === user?.id ? <Badge variant="secondary">you</Badge> : null}
                  </div>

                  <p className="truncate text-xs text-muted-foreground">
                    {p.username ? `${p.username} · ` : ""}
                    {p.email ?? "no email on file"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.id === user?.id ? null : (
                    <ResetAccess
                      userId={p.id}
                      label={p.full_name || (p.username ?? "this account")}
                      currentUsername={p.username}
                      currentEmail={p.email}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ["people"] })}
                    />
                  )}
                  {ROLES.map((role) => {
                    const has = p.roles.includes(role);
                    return (
                      <Button
                        key={role}
                        size="sm"
                        variant={has ? "default" : "outline"}
                        disabled={toggleRole.isPending}
                        onClick={() =>
                          toggleRole.mutate({ userId: p.id, role, has })
                        }
                      >
                        {role}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
