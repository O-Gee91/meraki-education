import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, MessageSquare, Plus, Reply, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";

type Discussion = {
  id: string;
  title: string;
  prompt: string;
  due_date: string | null;
  required_replies: number;
  graded: boolean;
  points_possible: number;
  closed: boolean;
  assignment_id: string | null;
  created_at: string;
};

export function DiscussionBoard({
  classId,
  isStaff,
  categories,
}: {
  classId: string;
  isStaff: boolean;
  categories: string[];
}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const draftKey = `discussion-new:${classId}`;
  const saved = readDraft<{
    title: string;
    prompt: string;
    dueDate: string;
    required: string;
    graded: boolean;
    points: string;
  }>(draftKey);
  const [title, setTitle] = useState(saved?.title ?? "");
  const [prompt, setPrompt] = useState(saved?.prompt ?? "");
  const [dueDate, setDueDate] = useState(saved?.dueDate ?? "");
  const [required, setRequired] = useState(saved?.required ?? "1");
  const [graded, setGraded] = useState(saved?.graded ?? true);
  const [points, setPoints] = useState(saved?.points ?? "10");
  const dirty = title.trim().length > 0 || prompt.trim().length > 0;
  const draft = useAutosaveDraft(
    draftKey,
    { title, prompt, dueDate, required, graded, points },
    { dirty, enabled: isStaff },
  );

  const { data: discussions = [] } = useQuery({
    queryKey: ["discussions", classId],
    queryFn: async (): Promise<Discussion[]> => {
      const { data, error } = await supabase
        .from("discussions")
        .select(
          "id, title, prompt, due_date, required_replies, graded, points_possible, closed, assignment_id, created_at",
        )
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Discussion[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const p = prompt.trim();
      if (t.length < 3) throw new Error("Give the discussion a title");
      if (p.length < 5) throw new Error("Write the discussion prompt");
      const pts = graded ? Number(points) || 0 : 0;

      let assignmentId: string | null = null;
      if (graded) {
        const { data: assignment, error: aErr } = await supabase
          .from("assignments")
          .insert({
            class_id: classId,
            title: t,
            category: categories.find((c) => /discussion/i.test(c)) ?? categories[0] ?? "Homework",
            points_possible: pts,
            due_date: dueDate || null,
            description: p,
            submission_mode: "collected",
          })
          .select("id")
          .single();
        if (aErr) throw aErr;
        assignmentId = assignment.id;
      }

      const { error } = await supabase.from("discussions").insert({
        class_id: classId,
        assignment_id: assignmentId,
        title: t,
        prompt: p,
        due_date: dueDate || null,
        required_replies: Math.max(0, Number(required) || 0),
        graded,
        points_possible: pts,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setPrompt("");
      setDueDate("");
      setRequired("1");
      setPoints("10");
      draft.clear();
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["discussions", classId] });
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      toast.success("Discussion posted to the class");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClosed = useMutation({
    mutationFn: async (d: Discussion) => {
      const { error } = await supabase
        .from("discussions")
        .update({ closed: !d.closed })
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["discussions", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discussions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discussions", classId] });
      toast.success("Discussion removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Discussion board</h3>
              <p className="text-xs text-muted-foreground">
                Post a prompt as an assignment — students reply in threads and graded discussions
                appear in the gradebook.
              </p>
            </div>
            <Button size="sm" variant={creating ? "outline" : "default"} onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-2 size-4" /> {creating ? "Cancel" : "New discussion"}
            </Button>
          </div>

          {creating && (
            <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Theme of chapter 4 — what does the light symbolize?"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Prompt / instructions</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Explain your thinking with evidence from the text, then respond to a classmate."
                />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Replies required</Label>
                <Input
                  type="number"
                  min={0}
                  value={required}
                  onChange={(e) => setRequired(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="disc-graded"
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={graded}
                  onChange={(e) => setGraded(e.target.checked)}
                />
                <Label htmlFor="disc-graded" className="cursor-pointer">
                  Graded assignment
                </Label>
              </div>
              {graded && (
                <div>
                  <Label>Points possible</Label>
                  <Input
                    type="number"
                    min={0}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </div>
              )}
              <div className="flex items-center gap-3 md:col-span-2">
                <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={dirty} />
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                >
                  Post discussion
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {discussions.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          No discussions yet.{" "}
          {isStaff ? "Create one to get the class talking." : "Your teacher hasn't posted one yet."}
        </p>
      ) : (
        discussions.map((d) => (
          <article key={d.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{d.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {d.graded ? (
                    <Badge variant="secondary">{d.points_possible} pts</Badge>
                  ) : (
                    <Badge variant="outline">Ungraded</Badge>
                  )}
                  {d.due_date ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> Due {formatDate(d.due_date)}
                    </span>
                  ) : null}
                  {d.required_replies > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Reply className="size-3.5" /> {d.required_replies} repl
                      {d.required_replies === 1 ? "y" : "ies"} required
                    </span>
                  ) : null}
                  {d.closed ? <Badge variant="destructive">Closed</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                  <MessageSquare className="mr-2 size-4" />
                  {openId === d.id ? "Hide thread" : "Open thread"}
                </Button>
                {isStaff && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => toggleClosed.mutate(d)}>
                      {d.closed ? "Reopen" : "Close"}
                    </Button>
                    <ConfirmDeleteButton
                      label="Delete"
                      title="Delete this discussion?"
                      description="All messages in the thread will be removed. The gradebook column stays unless you delete the assignment too."
                      onConfirm={() => remove.mutate(d.id)}
                    />
                  </>
                )}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{d.prompt}</p>
            {openId === d.id && <Thread discussion={d} isStaff={isStaff} />}
          </article>
        ))
      )}
    </div>
  );
}

function Thread({ discussion, isStaff }: { discussion: Discussion; isStaff: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["discussion-posts", discussion.id];
  const draftKey = `discussion-post:${discussion.id}`;
  const [body, setBody] = useState(() => readDraft<string>(draftKey) ?? "");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const draft = useAutosaveDraft(draftKey, body, { dirty: body.trim().length > 0 });

  const { data: posts = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussion_posts")
        .select("id, body, author_id, parent_id, created_at")
        .eq("discussion_id", discussion.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const { data: authors = [] } = useQuery({
    queryKey: ["discussion-authors", discussion.id, authorIds.join(",")],
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
    const a = authors.find((x) => x.id === id);
    return a?.full_name || a?.email || "Class member";
  };

  const add = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (text.length < 2) throw new Error("Write your response first");
      const { error } = await supabase.from("discussion_posts").insert({
        discussion_id: discussion.id,
        parent_id: replyTo,
        author_id: user!.id,
        body: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discussion_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const roots = posts.filter((p) => !p.parent_id);
  const repliesOf = (id: string) => posts.filter((p) => p.parent_id === id);

  const participation = isStaff
    ? [...new Set(posts.map((p) => p.author_id))].map((id) => ({
        id,
        name: nameFor(id),
        count: posts.filter((p) => p.author_id === id).length,
      }))
    : [];

  return (
    <div className="mt-4 border-t border-border pt-4">
      {isStaff && participation.length > 0 && (
        <div className="mb-4 rounded-md bg-secondary/50 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="size-3.5" /> Participation
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {participation.map((p) => (
              <Badge
                key={p.id}
                variant={p.count >= Math.max(1, discussion.required_replies) ? "secondary" : "outline"}
              >
                {p.name}: {p.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No responses yet — be the first to post.</p>
        ) : (
          roots.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3">
              <p className="text-xs font-semibold">
                {nameFor(p.author_id)}
                <span className="ml-2 font-normal text-muted-foreground">
                  {formatDate(p.created_at)}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
              <div className="mt-2 flex gap-3 text-xs">
                {!discussion.closed || isStaff ? (
                  <button
                    onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}
                    className="text-muted-foreground hover:text-accent"
                  >
                    {replyTo === p.id ? "Cancel reply" : "Reply"}
                  </button>
                ) : null}
                {(isStaff || p.author_id === user?.id) && (
                  <button
                    onClick={() => remove.mutate(p.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>

              {repliesOf(p.id).length > 0 && (
                <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
                  {repliesOf(p.id).map((r) => (
                    <div key={r.id} className="rounded-md bg-secondary/40 px-3 py-2">
                      <p className="text-xs font-semibold">
                        {nameFor(r.author_id)}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {formatDate(r.created_at)}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                      {(isStaff || r.author_id === user?.id) && (
                        <button
                          onClick={() => remove.mutate(r.id)}
                          className="mt-1 text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!discussion.closed || isStaff ? (
        <div className="mt-4">
          {replyTo ? (
            <p className="mb-1 text-xs text-muted-foreground">
              Replying to {nameFor(posts.find((p) => p.id === replyTo)?.author_id ?? "")}
            </p>
          ) : null}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={replyTo ? "Write your reply…" : "Post your response to the prompt…"}
          />
          <div className="mt-2 flex items-center gap-3">
            <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={body.trim().length > 0} />
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => add.mutate()}
              disabled={add.isPending}
            >
              {replyTo ? "Reply" : "Post response"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">This discussion is closed.</p>
      )}
    </div>
  );
}
