import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FormattedText } from "@/components/class/FormattedText";
import { useAuth } from "@/hooks/useAuth";
import { fetchAll } from "@/lib/query";

/** Admin-only original content; the database independently enforces this restriction. */
export function DeletedPostsLog({ threadId }: { threadId: string }) {
  const { isAdmin, user } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["discussion-deleted-posts", threadId, user?.id, isAdmin],
    enabled: isAdmin,
    queryFn: async () => {
      if (!isAdmin) return [];
      const data = await fetchAll((from, to) => supabase
        .from("discussion_post_audits")
        .select("id, post_id, parent_id, author_id, acted_by, old_body, post_created_at, acted_at")
        .eq("discussion_id", threadId)
        .eq("action", "deleted")
        .order("acted_at", { ascending: false })
        .order("id")
        .range(from, to));
      const ids = [...new Set(data.flatMap((r) => [r.author_id, r.acted_by]).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of people ?? []) names.set(p.id, p.full_name);
      }
      return data.map((r) => ({
        ...r,
        authorName: r.author_id ? (names.get(r.author_id) ?? "Unknown") : "Unknown",
        deleterName: r.acted_by ? (r.acted_by === r.author_id ? "the author" : (names.get(r.acted_by) ?? "Unknown")) : "Unknown",
      }));
    },
  });
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

  if (!isAdmin) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5">
          <History className="size-3.5" aria-hidden /> Deleted posts
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Deleted posts</SheetTitle>
          <SheetDescription>Only school administrators can see this record.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts have been deleted from this discussion.</p>
          ) : (
            rows.map((r) => (
              <article key={r.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {r.authorName} <span className="font-normal text-muted-foreground">· {r.parent_id ? "Reply" : "Main post"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Posted {fmt(r.post_created_at)} · Deleted {fmt(r.acted_at)} by {r.deleterName}
                </p>
                <div className="mt-2 rounded bg-muted/50 p-2">
                  {r.old_body ? <FormattedText text={r.old_body} /> : <span className="text-muted-foreground">No text recorded.</span>}
                </div>
              </article>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
