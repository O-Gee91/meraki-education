import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Pin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";


type Scope = { classId: string } | { groupId: string };

function scopeKey(scope: Scope) {
  return "classId" in scope ? ["feed", "class", scope.classId] : ["feed", "group", scope.groupId];
}

export function ClassFeed({ scope, canPost = true }: { scope: Scope; canPost?: boolean }) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const draftKey = `feed:${scopeKey(scope).join(":")}`;
  const saved = readDraft<{ body: string; link: string }>(draftKey);
  const [body, setBody] = useState(saved?.body ?? "");
  const [link, setLink] = useState(saved?.link ?? "");
  const dirty = body.trim().length > 0 || link.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, { body, link }, { dirty });


  const { data: posts = [] } = useQuery({
    queryKey: scopeKey(scope),
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id, body, link, pinned, created_at, author_id")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
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
      const { error } = await supabase.from("posts").insert({
        author_id: user!.id,
        body: text,
        link: link.trim() || null,
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

  return (
    <div className="mt-4 space-y-4">
      {canPost && (
        <div className="panel p-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share an update, question or resource with the class…"
            rows={3}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Optional link (document, video, site)"
              className="max-w-sm"
            />
            <Button
              size="sm"
              onClick={() => createPost.mutate()}
              disabled={createPost.isPending}
              className="ml-auto"
            >
              <Send className="mr-2 size-4" /> Post
            </Button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          No conversations yet. Start the first one.
        </p>
      ) : (
        posts.map((post) => (
          <article key={post.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {nameFor(post.author_id)}
                  {post.pinned ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent">
                      <Pin className="size-3" /> Pinned
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}</p>
              </div>
              <div className="flex gap-1">
                {isStaff && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePin.mutate({ id: post.id, pinned: post.pinned })}
                  >
                    {post.pinned ? "Unpin" : "Pin"}
                  </Button>
                )}
                {(isStaff || post.author_id === user?.id) && (
                  <Button variant="ghost" size="sm" onClick={() => removePost.mutate(post.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>
            {post.link ? (
              <a
                href={post.link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                {post.link}
              </a>
            ) : null}
            <Comments postId={post.id} nameFor={nameFor} />
          </article>
        ))
      )}
    </div>
  );
}

function Comments({
  postId,
  nameFor,
}: {
  postId: string;
  nameFor: (id: string) => string;
}) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

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

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="size-3.5" /> {comments.length} replies
      </p>
      <div className="mt-2 space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="rounded-md bg-secondary/50 px-3 py-2 text-sm">
            <p className="text-xs font-semibold">{nameFor(c.author_id)}</p>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            {(isStaff || c.author_id === user?.id) && (
              <button
                onClick={() => remove.mutate(c.id)}
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
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
        />
        <Button size="sm" variant="outline" onClick={() => add.mutate()} disabled={add.isPending}>
          Reply
        </Button>
      </div>
    </div>
  );
}
