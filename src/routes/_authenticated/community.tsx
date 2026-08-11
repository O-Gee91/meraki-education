import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ClassFeed } from "@/components/class/ClassFeed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community groups & school news — Meraki Education" },
      {
        name: "description",
        content:
          "Social classrooms, clubs, professional learning groups and the school news river for students, staff and guardians.",
      },
      { property: "og:title", content: "Community groups & school news — Meraki Education" },
      {
        property: "og:description",
        content:
          "Collaborate in secure groups, follow the school news river and share resources with your class community.",
      },
    ],
  }),
  component: CommunityPage,
});

const KINDS = [
  { value: "club", label: "Club or team" },
  { value: "pd", label: "Professional learning" },
  { value: "school", label: "School-wide" },
  { value: "class", label: "Class group" },
];

function CommunityPage() {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    kind: "club",
    visibility: "school",
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, description, kind, visibility, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["group-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("id, group_id, user_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: news = [] } = useQuery({
    queryKey: ["news-river"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 3) throw new Error("Give the group a name");
      const { error } = await supabase.from("groups").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        visibility: form.visibility,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", description: "", kind: "club", visibility: "school" });
      toast.success("Group created");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMembership = useMutation({
    mutationFn: async (groupId: string) => {
      const existing = memberships.find(
        (m) => m.group_id === groupId && m.user_id === user?.id,
      );
      if (existing) {
        const { error } = await supabase.from("group_members").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["group-memberships"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = groups.find((g) => g.id === activeGroup) ?? null;

  return (
    <AppShell
      title="Community"
      description="Groups, collaboration spaces and the school news river."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {isStaff && (
            <section className="panel p-5">
              <h2 className="text-sm font-semibold">Create a group</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="g-name">Name</Label>
                  <Input
                    id="g-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Grade 7 Robotics Club"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(kind) => setForm({ ...form, kind })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Visible to</Label>
                  <Select
                    value={form.visibility}
                    onValueChange={(visibility) => setForm({ ...form, visibility })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="school">Everyone in the school</SelectItem>
                      <SelectItem value="staff">Staff only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="g-desc">Description</Label>
                  <Textarea
                    id="g-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => createGroup.mutate()}
                disabled={createGroup.isPending}
              >
                Create group
              </Button>
            </section>
          )}

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Groups</h2>
            {groups.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No groups yet. Staff can open clubs, teams and professional learning spaces.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {groups.map((g) => {
                  const joined = memberships.some(
                    (m) => m.group_id === g.id && m.user_id === user?.id,
                  );
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-3 py-3">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setActiveGroup(g.id)}
                      >
                        <p className="text-sm font-medium hover:text-accent">{g.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.description || "No description"}
                        </p>
                      </button>
                      <Badge variant="outline">{g.kind}</Badge>
                      {g.visibility === "staff" ? <Badge>Staff only</Badge> : null}
                      <Button
                        size="sm"
                        variant={joined ? "outline" : "secondary"}
                        onClick={() => toggleMembership.mutate(g.id)}
                      >
                        {joined ? "Leave" : "Join"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selected && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Users2 className="size-5 text-accent" /> {selected.name}
              </h2>
              <ClassFeed scope={{ groupId: selected.id }} />
            </section>
          )}
        </div>

        <section className="panel h-fit p-5">
          <h2 className="text-sm font-semibold">School news river</h2>
          <div className="mt-4 space-y-4">
            {news.length === 0 ? (
              <p className="text-sm text-muted-foreground">No school news yet.</p>
            ) : (
              news.map((n) => (
                <article key={n.id}>
                  <h3 className="text-sm font-semibold">{n.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
