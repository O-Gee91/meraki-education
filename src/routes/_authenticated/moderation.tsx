import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAll } from "@/lib/query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormattedText } from "@/components/class/FormattedText";

export const Route = createFileRoute("/_authenticated/moderation")({
  head: () => ({
    meta: [
      { title: "Discussion moderation — Meraki Education" },
      { name: "description", content: "Administrators review removed discussion posts and replies across the school." },
      { property: "og:title", content: "Discussion moderation — Meraki Education" },
      { property: "og:description", content: "A school-wide record of removed discussion posts with original text." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModerationPage,
});

type Row = {
  id: string; discussion_id: string | null; parent_id: string | null; author_id: string | null;
  acted_by: string | null; old_body: string | null; post_created_at: string | null; acted_at: string;
};

function ModerationPage() {
  const { isAdmin, user } = useAuth();
  const [classFilter, setClassFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["moderation-audit", user?.id, isAdmin],
    enabled: isAdmin,
    queryFn: async () => {
      if (!isAdmin) return [];
      const rows = await fetchAll<Row>((a, b) =>
        supabase
          .from("discussion_post_audits")
          .select("id, discussion_id, parent_id, author_id, acted_by, old_body, post_created_at, acted_at")
          .eq("action", "deleted")
          .order("acted_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
      const discIds = [...new Set(rows.map((r) => r.discussion_id).filter(Boolean))] as string[];
      const people = [...new Set(rows.flatMap((r) => [r.author_id, r.acted_by]).filter(Boolean))] as string[];
      const [{ data: discs }, { data: profs }] = await Promise.all([
        discIds.length
          ? supabase.from("discussions").select("id, title, class_id, classes(name)").in("id", discIds)
          : Promise.resolve({ data: [] as never[] }),
        people.length
          ? supabase.from("profiles").select("id, full_name").in("id", people)
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const names = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
      const dmap = new Map(
        (discs ?? []).map((d: { id: string; title: string; class_id: string; classes: { name: string } | null }) => [d.id, d]),
      );
      return rows.map((r) => {
        const d = r.discussion_id ? dmap.get(r.discussion_id) : undefined;
        return {
          ...r,
          title: d?.title ?? "Unknown discussion",
          classId: d?.class_id ?? "",
          className: d?.classes?.name ?? "Unknown class",
          author: r.author_id ? (names.get(r.author_id) ?? "Unknown") : "Unknown",
          deleter: r.acted_by ? (r.acted_by === r.author_id ? "the author" : (names.get(r.acted_by) ?? "Unknown")) : "Unknown",
        };
      });
    },
  });

  const rows = data ?? [];
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.classId) m.set(r.classId, r.className);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const shown = rows.filter((r) => {
    const day = r.acted_at.slice(0, 10);
    return (classFilter === "all" || r.classId === classFilter) && (!from || day >= from) && (!to || day <= to);
  });
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

  if (!isAdmin) {
    return (
      <AppShell title="Discussion moderation" description="Administrator access required." desktopReview>
        <p className="text-sm text-muted-foreground">Only school administrators can open this page.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Discussion moderation" description="Removed posts and replies across the school, with the original text." desktopReview>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_10rem_10rem]">
        <div className="min-w-0 space-y-1.5">
          <Label>Class</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="mod-from">Removed from</Label><Input id="mod-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mod-to">Removed to</Label><Input id="mod-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{shown.length} of {rows.length} removed items</p>
      <div className="mt-3 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No removed posts match these filters.</p>
        ) : (
          shown.map((r) => (
            <article key={r.id} className="min-w-0 rounded-md border border-border bg-card p-4 text-sm">
              <p className="font-medium [overflow-wrap:anywhere]">
                {r.author} <span className="font-normal text-muted-foreground">· {r.parent_id ? "Reply" : "Main post"} · {r.className} · {r.title}</span>
              </p>
              <p className="text-xs text-muted-foreground">Posted {fmt(r.post_created_at)} · Removed {fmt(r.acted_at)} by {r.deleter}</p>
              <div className="mt-2 rounded bg-muted/50 p-2 [overflow-wrap:anywhere]">
                {r.old_body ? <FormattedText text={r.old_body} /> : <span className="text-muted-foreground">No text recorded.</span>}
              </div>
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
