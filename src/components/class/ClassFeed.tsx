import { useState } from "react";
import { usePagedLimit } from "@/lib/paged";
import { ShowOlder } from "@/components/ShowOlder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Link2, MessageSquare, Pin, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { POST_MAX_LENGTH, REPLY_MAX_LENGTH, safeLink, splitPinned } from "@/lib/feed-safety";


type Scope = { classId: string } | { groupId: string };

function scopeKey(scope: Scope) {
  return "classId" in scope ? ["feed", "class", scope.classId] : ["feed", "group", scope.groupId];
}

export function ClassFeed({ scope, canPost = true, desktopReview = false }: { scope: Scope; canPost?: boolean; desktopReview?: boolean }) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const draftKey = `feed:${scopeKey(scope).join(":")}`;
  const saved = readDraft<{ body: string; link: string }>(draftKey);
  const [body, setBody] = useState(saved?.body ?? "");
  const [link, setLink] = useState(saved?.link ?? "");
  const dirty = body.trim().length > 0 || link.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, { body, link }, { dirty });


  const postsPage = usePagedLimit(50);
  const { data: posts = [], isFetching: postsFetching } = useQuery({
    queryKey: [...scopeKey(scope), postsPage.limit],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id, body, link, pinned, created_at, author_id")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(postsPage.limit);
      query =
        "classId" in scope
          ? query.eq("class_id", scope.classId)
          : query.eq("group_id", scope.groupId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const { data: authors = [] } = useQuery({
    queryKey: ["feed-authors", authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      if (error) throw error;
      return data;
    },
  });
  const nameFor = (id: string) => {
    const p = authors.find((a) => a.id === id);
    return p?.full_name || p?.email || "School member";
  };

  const createPost = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (text.length < 2) throw new Error("Write something first");
      const resource = link.trim() ? safeLink(link) : null;
      if (link.trim() && !resource) throw new Error("Use a web link starting with https://");
      const { error } = await supabase.from("posts").insert({
        author_id: user!.id,
        body: text,
        link: resource?.href ?? null,
        ...("classId" in scope ? { class_id: scope.classId } : { group_id: scope.groupId }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setLink("");
      draft.clear();
      queryClient.invalidateQueries({ queryKey: scopeKey(scope) });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: async (post: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("posts")
        .update({ pinned: !post.pinned })
        .eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scopeKey(scope) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scopeKey(scope) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [filter, setFilter] = useState<"all" | "resources">("all");
  const linkProblem = link.trim() && !safeLink(link) ? "Use a web link starting with https://" : null;
  const shown = filter === "resources" ? posts.filter((p) => safeLink(p.link)) : posts;
  const { pinned, recent } = splitPinned(shown);
  const resourceCount = posts.filter((p) => safeLink(p.link)).length;

  const renderPost = (post: (typeof posts)[number]) => {
    const resource = safeLink(post.link);
    return (
      <article key={post.id} className={desktopReview ? "min-w-0 border-b border-border pb-6" : "panel p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {nameFor(post.author_id)}
              {post.pinned ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Pin className="size-3" aria-hidden="true" /> Pinned
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTime(post.created_at)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {isStaff && (
              <Button variant="ghost" size="sm" onClick={() => togglePin.mutate({ id: post.id, pinned: post.pinned })}>
                {post.pinned ? "Unpin" : "Pin"}
              </Button>
            )}
            {(isStaff || post.author_id === user?.id) && (
              <ConfirmDeleteButton
                label="Delete"
                title="Delete this post?"
                description="The post and its replies will be removed for everyone."
                onConfirm={() => removePost.mutate(post.id)}
              />
            )}
          </div>
        </div>
        <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
        {resource ? (
          <a
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-3 flex max-w-prose items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
          >
            <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Shared resource</span>
              <span className="block truncate text-xs text-muted-foreground">{resource.host}</span>
            </span>
            <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
        ) : null}
        <Comments postId={post.id} nameFor={nameFor} desktopReview={desktopReview} />
      </article>
    );
  };

  return (
    <div className={desktopReview ? "mt-4 min-w-0 space-y-6 [overflow-wrap:anywhere]" : "mt-4 space-y-4"}>
      {canPost && (
        <div className={desktopReview ? "min-w-0 border-b border-border pb-5" : "panel p-4"}>
          <Textarea
            aria-label="Group or class update"
            value={body}
            maxLength={POST_MAX_LENGTH}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share an update, question or resource with the class…"
            rows={3}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              aria-label="Optional post link"
              aria-invalid={!!linkProblem}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Optional link (document, video, site)"
              className={desktopReview ? "min-w-0 flex-1 basis-48" : "max-w-sm"}
            />
            <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={dirty} />
            <Button
              size="sm"
              onClick={() => createPost.mutate()}
              disabled={createPost.isPending || !!linkProblem}
              className="ml-auto shrink-0"
              variant={desktopReview ? "outline" : "default"}
            >
              <Send className="mr-2 size-4" /> Post
            </Button>
          </div>
          {linkProblem ? <p className="mt-1 text-xs text-destructive">{linkProblem}</p> : null}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Be kind and on-topic. Don't share phone numbers, addresses or passwords. Your name shows on every post, and teachers can remove posts.
          </p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter posts">
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All posts ({posts.length})
          </Button>
          <Button size="sm" variant={filter === "resources" ? "secondary" : "ghost"} aria-pressed={filter === "resources"} onClick={() => setFilter("resources")}>
            Resources ({resourceCount})
          </Button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className={desktopReview ? "py-3 text-sm text-muted-foreground" : "panel p-6 text-sm text-muted-foreground"}>
          {filter === "resources" ? "No links shared yet." : "No conversations yet. Start the first one."}
        </p>
      ) : (
        <>
          {pinned.length > 0 && (
            <section aria-label="Pinned updates" className="space-y-4 rounded-md bg-muted/40 p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Pin className="size-3.5" aria-hidden="true" /> Pinned by your teacher
              </h3>
              {pinned.map(renderPost)}
            </section>
          )}
          {recent.length > 0 && (
            <section aria-label="Recent posts" className={desktopReview ? "space-y-6" : "space-y-4"}>
              {pinned.length > 0 && (
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</h3>
              )}
              {recent.map(renderPost)}
            </section>
          )}
          <ShowOlder show={postsPage.hasMore(posts.length)} loading={postsFetching} onClick={postsPage.showMore} label="Show older posts" />
        </>
      )}
    </div>
  );
}

const VISIBLE_REPLIES = 2;

function Comments({
  postId,
  nameFor,
  desktopReview = false,
}: {
  postId: string;
  nameFor: (id: string) => string;
  desktopReview?: boolean;
}) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const draftKey = `comment:${postId}`;
  const [body, setBody] = useState(() => readDraft<string>(draftKey) ?? "");
  const [expanded, setExpanded] = useState(false);
  const draft = useAutosaveDraft(draftKey, body, { dirty: body.trim().length > 0 });

  const { data: comments = [] } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_comments")
        .select("id, body, author_id, created_at")
        .eq("post_id", postId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Write a reply first");
      const { error } = await supabase
        .from("post_comments")
        .insert({ post_id: postId, author_id: user!.id, body: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      draft.clear();
      setExpanded(true);
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("post_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["post-comments", postId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const hidden = expanded ? 0 : Math.max(0, comments.length - VISIBLE_REPLIES);
  const visible = comments.slice(hidden);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="size-3.5" /> {comments.length} {comments.length === 1 ? "reply" : "replies"}
      </p>
      {hidden > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline">
          Show {hidden} earlier {hidden === 1 ? "reply" : "replies"}
        </button>
      )}
      <div className="mt-2 space-y-2">
        {visible.map((c) => (
          <div key={c.id} className={desktopReview ? "min-w-0 border-l border-border pl-3 py-2 text-sm" : "rounded-md bg-secondary/50 px-3 py-2 text-sm"}>
            <p className="text-xs font-semibold">
              {nameFor(c.author_id)}
              <span className="ml-2 font-normal text-muted-foreground">{formatDateTime(c.created_at)}</span>
            </p>
            <p className="mt-1 max-w-prose whitespace-pre-wrap leading-relaxed">{c.body}</p>
            {(isStaff || c.author_id === user?.id) && (
              <button
                onClick={() => {
                  if (window.confirm("Remove this reply?")) remove.mutate(c.id);
                }}
                className="mt-1 text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          aria-label="Write a reply"
          value={body}
          maxLength={REPLY_MAX_LENGTH}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a kind reply…"
        />
        <Button size="sm" variant="outline" onClick={() => add.mutate()} disabled={add.isPending}>
          Reply
        </Button>
      </div>
    </div>
  );
}
