import { useState } from "react";
import { usePagedLimit } from "@/lib/paged";
import { ShowOlder } from "@/components/ShowOlder";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, LockKeyhole, Plus, Users2 } from "lucide-react";
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
import { NotebookEmpty } from "@/components/NotebookDecorations";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  const newsPage = usePagedLimit(10);
  const { data: news = [], isFetching: newsFetching } = useQuery({
    queryKey: ["news-river", newsPage.limit],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(newsPage.limit);
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
      desktopReview
      title="Community"
      description="Groups, collaboration spaces and the school news river."
    >
      <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
          {isStaff && (
            <details className="group border-t border-border pt-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><Plus className="size-4" aria-hidden="true" />Create a group</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor="g-name">Name</Label>
                  <Input
                    id="g-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Grade 7 Robotics Club"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="g-kind">Type</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(kind) => setForm({ ...form, kind })}
                  >
                    <SelectTrigger id="g-kind" className="min-w-0 [&>span]:min-w-0">
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
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="g-visibility">Visible to</Label>
                  <Select
                    value={form.visibility}
                    onValueChange={(visibility) => setForm({ ...form, visibility })}
                  >
                    <SelectTrigger id="g-visibility" className="min-w-0 [&>span]:min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="school">Everyone in the school</SelectItem>
                      <SelectItem value="staff">Staff only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
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
                <Plus className="size-4" aria-hidden="true" />
                Create group
              </Button>
            </details>
          )}

          {selected && (
            <section className="min-w-0 border-t border-border pt-5" aria-label="Selected group conversation">
              <h2 className="flex items-start gap-2 text-lg font-semibold">
                <Users2 className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" /> {selected.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Group conversation — posts here stay in this group and are separate from class feeds.
              </p>
              <ClassFeed scope={{ groupId: selected.id }} desktopReview />
            </section>
          )}

          <section className="min-w-0 border-t border-border pt-5" aria-label="Community groups">
            <h2 className="notebook-heading text-lg font-semibold">Groups</h2>
            {groups.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No groups yet. Staff can open clubs, teams and professional learning spaces.
              </p>
            ) : (
              <ul className="mt-4 min-w-0 divide-y divide-border">
                {groups.map((g) => {
                  const joined = memberships.some(
                    (m) => m.group_id === g.id && m.user_id === user?.id,
                  );
                  return (
                    <li key={g.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-4">
                      <div className="min-w-0">
                      <Button
                        variant="ghost"
                        aria-pressed={activeGroup === g.id}
                        className="h-auto max-w-full justify-start whitespace-normal px-0 py-0 text-left text-base font-semibold [overflow-wrap:anywhere]"
                        onClick={() => setActiveGroup(g.id)}
                      >
                        {g.name}
                      </Button>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{KINDS.find((kind) => kind.value === g.kind)?.label ?? g.kind}</span>
                        {g.visibility === "staff" ? <Badge variant="outline" className="gap-1 font-normal text-muted-foreground"><LockKeyhole className="size-3" aria-hidden="true" />Staff only</Badge> : null}
                        {activeGroup === g.id ? <span>Selected</span> : null}
                      </div>
                      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                        {g.description || "No description"}
                      </p>
                      </div>
                      <Button
                        className="w-16"
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

        </div>

        <section className="min-w-0 border-t border-border pt-5 [overflow-wrap:anywhere]" aria-label="School news">
          <h2 className="notebook-heading text-lg font-semibold">School news river</h2>
          <div className="notebook-cork mt-4 divide-y divide-border">
            {news.length === 0 ? (
              <NotebookEmpty className="text-sm text-muted-foreground">No school news yet.</NotebookEmpty>
            ) : (
              news.map((n) => (
                <article key={n.id} className="notebook-paper notebook-pin min-w-0 py-4 first:pt-0">
                  <h3 className="notebook-data text-base font-semibold">{n.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                  <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed text-foreground/85">{n.body}</p>
                </article>
              ))
            )}
          </div>
          <ShowOlder show={newsPage.hasMore(news.length)} loading={newsFetching} onClick={newsPage.showMore} />
        </section>
      </div>
    </AppShell>
  );
}
