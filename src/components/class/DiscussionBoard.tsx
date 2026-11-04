import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ClipboardCheck, Link2, MessageSquare, Pencil, Plus, Reply, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { useAuth } from "@/hooks/useAuth";
import { useCoTaughtClassIds } from "@/hooks/useCoTaughtClasses";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/school";
import { POST_MAX_LENGTH } from "@/lib/feed-safety";
import { discussionTotalPossible, formatPoints, studentDiscussionTotal } from "@/lib/discussion";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { FormattedEditor, FormattedText } from "@/components/class/FormattedText";
import { formatZoned, isoToZonedInput, zonedInputToIso } from "@/lib/coursework-window";

const DEFAULT_DUE_TIME = "23:59";
/** Builds the exact due instant from a date + time typed in the class time zone. */
function dueInstant(date: string, time: string, tz: string) {
  return date ? zonedInputToIso(`${date}T${time || DEFAULT_DUE_TIME}`, tz) : null;
}
function isLocked(d: { available_from: string | null }) {
  return !!d.available_from && Date.parse(d.available_from) > Date.now();
}

type Discussion = {
  id: string;
  class_id: string;
  title: string;
  prompt: string;
  due_date: string | null;
  due_at: string | null;
  available_from: string | null;
  required_replies: number;
  graded: boolean;
  points_possible: number;
  response_points: number;
  reply_points: number;
  closed: boolean;
  assignment_id: string | null;
  share_group: string | null;
  thread_id: string | null;
  edited_at: string | null;
  created_by: string | null;
  created_at: string;
};

type Post = { id: string; body: string; author_id: string; parent_id: string | null; created_at: string };
type Score = { post_id: string; author_id: string; points: number; max_points: number };

const COLS =
  "id, class_id, title, prompt, due_date, due_at, available_from, required_replies, graded, points_possible, response_points, reply_points, closed, assignment_id, share_group, thread_id, edited_at, created_by, created_at";

const SELECT_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Max points for a main response / a reply (legacy discussions fall back to the whole total). */
function maxFor(d: Discussion, isReply: boolean) {
  if (d.response_points === 0 && d.reply_points === 0) return isReply ? 0 : Number(d.points_possible);
  return Number(isReply ? d.reply_points : d.response_points);
}

type Scope = "class" | "classes" | "grade";

export function DiscussionBoard({
  classId,
  isStaff,
  categories,
  timeZone = "Asia/Shanghai",
}: {
  classId: string;
  isStaff: boolean;
  categories: string[];
  timeZone?: string;
}) {
  const { user, isAdmin } = useAuth();
  const coTaught = useCoTaughtClassIds();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Discussion | null>(null);

  const draftKey = `discussion-new:${classId}`;
  const saved = readDraft<{
    title: string; prompt: string; dueDate: string; dueTime?: string; opensAt?: string; required: string; graded: boolean; responsePts: string; replyPts: string; category?: string;
  }>(draftKey);
  const [title, setTitle] = useState(saved?.title ?? "");
  const [prompt, setPrompt] = useState(saved?.prompt ?? "");
  const [dueDate, setDueDate] = useState(saved?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(saved?.dueTime ?? DEFAULT_DUE_TIME);
  const [opensAt, setOpensAt] = useState(saved?.opensAt ?? "");
  const [required, setRequired] = useState(saved?.required ?? "1");
  const [graded, setGraded] = useState(saved?.graded ?? true);
  const [responsePts, setResponsePts] = useState(saved?.responsePts ?? "6");
  const [replyPts, setReplyPts] = useState(saved?.replyPts ?? "2");
  const [scope, setScope] = useState<Scope>("class");
  const [pickedClasses, setPickedClasses] = useState<Set<string>>(new Set([classId]));
  const [grade, setGrade] = useState<string>("");
  const [sharedThread, setSharedThread] = useState(false);
  const defaultCategory = categories.find((c) => /discussion|participation/i.test(c)) ?? categories[0] ?? "Homework";
  const [category, setCategory] = useState(saved?.category ?? defaultCategory);
  const effectiveCategory = categories.includes(category) ? category : defaultCategory;
  const dirty = title.trim().length > 0 || prompt.trim().length > 0;
  const draft = useAutosaveDraft(
    draftKey,
    { title, prompt, dueDate, dueTime, opensAt, required, graded, responsePts, replyPts, category },
    { dirty, enabled: isStaff },
  );

  const totalPossible = discussionTotalPossible(Number(responsePts) || 0, Number(replyPts) || 0, Number(required) || 0);

  const { data: discussions = [] } = useQuery({
    queryKey: ["discussions", classId],
    queryFn: async (): Promise<Discussion[]> => {
      const { data, error } = await supabase.from("discussions").select(COLS).eq("class_id", classId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Discussion[];
    },
  });

  const linkedAssignmentIds = discussions.map((d) => d.assignment_id).filter((x): x is string => !!x);
  const { data: categoryById = {} } = useQuery({
    queryKey: ["assignments", "discussion-categories", classId, linkedAssignmentIds.join(",")],
    enabled: linkedAssignmentIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("assignments").select("id, category").in("id", linkedAssignmentIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((a) => [a.id, a.category]));
    },
  });


  // Classes this educator can post into (own, co-taught; admins: all).
  const { data: myClasses = [] } = useQuery({
    queryKey: ["discussion-target-classes", user?.id, isAdmin, [...coTaught].join(",")],
    enabled: isStaff && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, period, grade_level, teacher_id").order("name");
      if (error) throw error;
      return (data ?? []).filter((c) => isAdmin || c.teacher_id === user!.id || coTaught.has(c.id) || c.id === classId);
    },
  });
  const grades = useMemo(
    () => [...new Set(myClasses.map((c) => c.grade_level).filter((g): g is number => g != null))].sort((a, b) => a - b),
    [myClasses],
  );
  const [gradeExcluded, setGradeExcluded] = useState<Set<string>>(new Set());
  const gradeClasses = useMemo(
    () => myClasses.filter((c) => String(c.grade_level) === grade),
    [myClasses, grade],
  );
  const targetIds = useMemo(() => {
    if (scope === "class") return [classId];
    if (scope === "classes") return [...pickedClasses];
    return gradeClasses.filter((c) => !gradeExcluded.has(c.id)).map((c) => c.id);
  }, [scope, classId, pickedClasses, gradeClasses, gradeExcluded]);

  const create = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const p = prompt.trim();
      if (t.length < 3) throw new Error("Give the discussion a title");
      if (p.length < 5) throw new Error("Write the discussion prompt");
      if (targetIds.length === 0) throw new Error("Choose at least one class to post to");
      const dueAt = dueInstant(dueDate, dueTime, timeZone);
      const openIso = zonedInputToIso(opensAt, timeZone);
      if (openIso && dueAt && Date.parse(dueAt) <= Date.parse(openIso)) throw new Error("The due time must be after the opening time");
      const rp = graded ? Math.max(0, Number(responsePts) || 0) : 0;
      const yp = graded ? Math.max(0, Number(replyPts) || 0) : 0;
      const req = Math.max(0, Number(required) || 0);
      const pts = graded ? discussionTotalPossible(rp, yp, req) : 0;
      const shareGroup = targetIds.length > 1 ? crypto.randomUUID() : null;
      let hostId: string | null = null;
      // Post to the current class first so it hosts a shared thread.
      const ordered = [...targetIds].sort((a, b) => (a === classId ? -1 : b === classId ? 1 : 0));
      for (const cid of ordered) {
        let assignmentId: string | null = null;
        if (graded) {
          const { data: a, error: aErr } = await supabase
            .from("assignments")
            .insert({
              class_id: cid,
              title: t,
              category: effectiveCategory,
              points_possible: pts,
              due_date: dueDate || null,
              available_from: openIso,
              description: p,
              submission_mode: "collected",
            })
            .select("id")
            .single();
          if (aErr) throw aErr;
          assignmentId = a.id;
        }
        const { data: d, error }: { data: { id: string } | null; error: unknown } = await supabase
          .from("discussions")
          .insert({
            class_id: cid,
            assignment_id: assignmentId,
            title: t,
            prompt: p,
            due_date: dueDate || null,
            due_at: dueAt,
            available_from: openIso,
            required_replies: req,
            graded,
            points_possible: pts,
            response_points: rp,
            reply_points: yp,
            share_group: shareGroup,
            thread_id: sharedThread && hostId ? hostId : null,
            created_by: user!.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (!hostId && d) hostId = d.id;
      }
      return ordered.length;
    },
    onSuccess: (n) => {
      setTitle(""); setPrompt(""); setDueDate(""); setDueTime(DEFAULT_DUE_TIME); setOpensAt(""); setRequired("1");
      setScope("class"); setPickedClasses(new Set([classId])); setSharedThread(false);
      draft.clear();
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["discussions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.success(n > 1 ? `Discussion posted to ${n} classes` : "Discussion posted to the class");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClosed = useMutation({
    mutationFn: async (d: Discussion) => {
      // A shared thread has one set of posts, so open/closed must match in every class using it.
      const hostId = d.thread_id ?? d.id;
      const { error } = await supabase
        .from("discussions")
        .update({ closed: !d.closed })
        .or(`id.eq.${hostId},thread_id.eq.${hostId}`);
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

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Discussion board</h3>
              <p className="text-xs text-muted-foreground">
                Post a prompt to this class, several classes or a whole grade. Each post and reply can be scored.
              </p>
            </div>
            <Button size="sm" variant={creating ? "outline" : "default"} onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-2 size-4" /> {creating ? "Cancel" : "New discussion"}
            </Button>
          </div>

          {creating && (
            <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Theme of chapter 4 — what does the light symbolize?" />
              </div>
              <div className="md:col-span-2">
                <Label>Prompt / instructions</Label>
                <FormattedEditor value={prompt} onChange={setPrompt} rows={4} ariaLabel="Discussion prompt" placeholder="Explain your thinking with evidence from the text, then respond to a classmate." />
              </div>

              <fieldset className="md:col-span-2 space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Post to</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(scope === "class")} onClick={() => setScope("class")} aria-pressed={scope === "class"}>This class only</button>
                  <button type="button" className={chip(scope === "classes")} onClick={() => setScope("classes")} aria-pressed={scope === "classes"}>Selected classes</button>
                  <button type="button" className={chip(scope === "grade")} onClick={() => setScope("grade")} aria-pressed={scope === "grade"} disabled={grades.length === 0}>A whole grade</button>
                </div>
                {scope === "classes" && (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {myClasses.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[hsl(var(--primary))]"
                          checked={pickedClasses.has(c.id)}
                          onChange={(e) => {
                            const n = new Set(pickedClasses);
                            if (e.target.checked) n.add(c.id); else n.delete(c.id);
                            setPickedClasses(n);
                          }}
                        />
                        {c.name}{c.period ? ` · ${c.period}` : ""}{c.grade_level ? ` · Grade ${c.grade_level}` : ""}
                      </label>
                    ))}
                  </div>
                )}
                {scope === "grade" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">1. Pick a grade</span>
                      {grades.map((g) => (
                        <button key={g} type="button" className={chip(grade === String(g))} onClick={() => { setGrade(String(g)); setGradeExcluded(new Set()); }} aria-pressed={grade === String(g)}>Grade {g}</button>
                      ))}
                    </div>
                    {grade && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">2. Choose classes ({targetIds.length} selected)</p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {gradeClasses.map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                              <input
                                type="checkbox"
                                className="size-4 accent-[hsl(var(--primary))]"
                                checked={!gradeExcluded.has(c.id)}
                                disabled={c.id === classId}
                                onChange={(e) => {
                                  const n = new Set(gradeExcluded);
                                  if (e.target.checked) n.delete(c.id); else n.add(c.id);
                                  setGradeExcluded(n);
                                }}
                              />
                              {c.name}{c.period ? ` · ${c.period}` : ""}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {targetIds.length > 1 && (
                  <div className="space-y-1 border-t border-border pt-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="thread-mode" checked={!sharedThread} onChange={() => setSharedThread(false)} className="accent-[hsl(var(--primary))]" />
                      Separate thread per class — students only see classmates in their own period
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="thread-mode" checked={sharedThread} onChange={() => setSharedThread(true)} className="accent-[hsl(var(--primary))]" />
                      One shared thread — students across these classes discuss together
                    </label>
                    <p className="text-xs text-muted-foreground">Grades always stay in each class's own gradebook.</p>
                  </div>
                )}
              </fieldset>

              <div>
                <Label>Due date and time</Label>
                <div className="flex gap-2">
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
                  <Input type="time" className="w-32" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} aria-label="Due time" />
                </div>
              </div>
              <div>
                <Label>Opens for students (optional)</Label>
                <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} aria-label="Opens for students" />
                <p className="mt-1 text-xs text-muted-foreground">Leave blank to open right away. Students see it locked until then.</p>
              </div>
              <div>
                <Label>Replies required</Label>
                <Input type="number" min={0} value={required} onChange={(e) => setRequired(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input id="disc-graded" type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={graded} onChange={(e) => setGraded(e.target.checked)} />
                <Label htmlFor="disc-graded" className="cursor-pointer">Graded assignment</Label>
              </div>
              {graded && (
                <>
                  <div>
                    <Label>Points for main response</Label>
                    <Input type="number" min={0} value={responsePts} onChange={(e) => setResponsePts(e.target.value)} />
                  </div>
                  <div>
                    <Label>Points per reply</Label>
                    <Input type="number" min={0} value={replyPts} onChange={(e) => setReplyPts(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="disc-category">Grading category</Label>
                    <select id="disc-category" className={SELECT_CLS} value={effectiveCategory} onChange={(e) => setCategory(e.target.value)}>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Points count toward this category's weight in each class gradebook.</p>
                  </div>
                  <p className="text-sm md:col-span-2">
                    Total: <span className="font-semibold">{totalPossible} pts</span>
                    <span className="text-muted-foreground"> (response {Number(responsePts) || 0} + {Number(required) || 0} × {Number(replyPts) || 0} per reply)</span>
                  </p>
                </>
              )}
              <div className="flex items-center gap-3 md:col-span-2">
                <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={dirty} />
                <Button size="sm" className="ml-auto" onClick={() => create.mutate()} disabled={create.isPending}>
                  {targetIds.length > 1 ? `Post to ${targetIds.length} classes` : "Post discussion"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {discussions.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          No discussions yet. {isStaff ? "Create one to get the class talking." : "Your teacher hasn't posted one yet."}
        </p>
      ) : (
        [...discussions].sort((a, b) => Number(a.closed) - Number(b.closed)).map((d) => (
          <article key={d.id} className={d.closed ? "panel p-4 opacity-80" : "panel p-4"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{d.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {d.graded ? <Badge variant="secondary">{d.points_possible} pts</Badge> : <Badge variant="outline">Ungraded</Badge>}
                  {isLocked(d) ? (
                    <Badge variant="outline">{isStaff ? "Scheduled" : "Locked"} · Opens {formatZoned(d.available_from, timeZone)}</Badge>
                  ) : null}
                  {d.graded && d.assignment_id && categoryById[d.assignment_id] ? (
                    <Badge variant="secondary">{categoryById[d.assignment_id]} · {Number(d.points_possible)} pts</Badge>
                  ) : null}
                  {d.due_at ? (
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> Due {formatZoned(d.due_at, timeZone)}</span>
                  ) : d.due_date ? (
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> Due {formatDate(d.due_date)}</span>
                  ) : null}
                  {d.required_replies > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Reply className="size-3.5" /> {d.required_replies} repl{d.required_replies === 1 ? "y" : "ies"} required
                    </span>
                  ) : null}
                  {isStaff && d.share_group ? (
                    <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" /> {d.thread_id ? "Shared thread" : "Posted to several classes"}</span>
                  ) : null}
                  {d.edited_at ? <span>Edited {formatDateTime(d.edited_at)}</span> : null}
                  {d.closed ? <Badge variant="outline">Closed to new posts</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!isStaff && isLocked(d)} onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                  <MessageSquare className="mr-2 size-4" />
                  {openId === d.id ? "Hide thread" : "Open thread"}
                </Button>
                {isStaff && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                      <Pencil className="mr-1.5 size-4" /> Edit prompt
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleClosed.mutate(d)}>{d.closed ? "Reopen" : "Close"}</Button>
                    <ConfirmDeleteButton
                      label="Delete"
                      title="Delete this discussion?"
                      description={d.thread_id || d.share_group ? "This removes the discussion from this class only. If other classes share the thread, their posts and scores are kept. The gradebook column stays unless you delete the assignment too." : "All messages in the thread will be removed. The gradebook column stays unless you delete the assignment too."}
                      onConfirm={() => remove.mutate(d.id)}
                    />
                  </>
                )}
              </div>
            </div>
            <FormattedText text={d.prompt} className="mt-3 max-w-prose" />
            {openId === d.id && (isStaff || !isLocked(d)) && <Thread discussion={d} isStaff={isStaff} />}
          </article>
        ))
      )}

      {editing && (
        <EditDiscussionDialog
          discussion={editing}
          timeZone={timeZone}
          categories={categories}
          currentCategory={editing.assignment_id ? categoryById[editing.assignment_id] : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditDiscussionDialog({ discussion: d, timeZone, categories, currentCategory, onClose }: { discussion: Discussion; timeZone: string; categories: string[]; currentCategory?: string | undefined; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(d.title);
  const [prompt, setPrompt] = useState(d.prompt);
  const [dueDate, setDueDate] = useState(d.due_date ?? "");
  const [dueTime, setDueTime] = useState(d.due_at ? isoToZonedInput(d.due_at, timeZone).slice(11, 16) : DEFAULT_DUE_TIME);
  const [opensAt, setOpensAt] = useState(isoToZonedInput(d.available_from, timeZone));
  const [required, setRequired] = useState(String(d.required_replies));
  const legacy = d.response_points === 0 && d.reply_points === 0;
  const [responsePts, setResponsePts] = useState(String(legacy ? d.points_possible : d.response_points));
  const [replyPts, setReplyPts] = useState(String(d.reply_points));
  const [allLinked, setAllLinked] = useState(!!d.share_group);
  const [category, setCategory] = useState(currentCategory ?? "");
  const categoryOptions = currentCategory && !categories.includes(currentCategory) ? [currentCategory, ...categories] : categories;

  const save = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const p = prompt.trim();
      if (t.length < 3) throw new Error("Give the discussion a title");
      if (p.length < 5) throw new Error("Write the discussion prompt");
      const req = Math.max(0, Number(required) || 0);
      const rp = d.graded ? Math.max(0, Number(responsePts) || 0) : 0;
      const yp = d.graded ? Math.max(0, Number(replyPts) || 0) : 0;
      const pts = d.graded ? discussionTotalPossible(rp, yp, req) : 0;
      const dueAt = dueInstant(dueDate, dueTime, timeZone);
      const openIso = zonedInputToIso(opensAt, timeZone);
      if (openIso && dueAt && Date.parse(dueAt) <= Date.parse(openIso)) throw new Error("The due time must be after the opening time");
      let targets: { id: string; assignment_id: string | null }[] = [{ id: d.id, assignment_id: d.assignment_id }];
      if (allLinked && d.share_group) {
        const { data, error } = await supabase.from("discussions").select("id, assignment_id").eq("share_group", d.share_group);
        if (error) throw error;
        targets = data ?? targets;
      }
      for (const x of targets) {
        const { error } = await supabase
          .from("discussions")
          .update({ title: t, prompt: p, due_date: dueDate || null, due_at: dueAt, available_from: openIso, required_replies: req, response_points: rp, reply_points: yp, points_possible: pts, edited_at: new Date().toISOString() })
          .eq("id", x.id);
        if (error) throw error;
        if (x.assignment_id) {
          const { error: aErr } = await supabase
            .from("assignments")
            .update({ title: t, description: p, due_date: dueDate || null, available_from: openIso, points_possible: pts, ...(category ? { category } : {}) })
            .eq("id", x.assignment_id);
          if (aErr) throw aErr;
        }
      }
      // Classes sharing one thread must always share the same opening time.
      const hostId = d.thread_id ?? d.id;
      const { error: syncErr } = await supabase
        .from("discussions")
        .update({ available_from: openIso })
        .or(`id.eq.${hostId},thread_id.eq.${hostId}`);
      if (syncErr) throw syncErr;
      return targets.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["discussions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.success(n > 1 ? `Prompt updated in ${n} classes` : "Prompt updated — replies were kept");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit prompt</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Prompt / instructions</Label><FormattedEditor value={prompt} onChange={setPrompt} rows={5} ariaLabel="Discussion prompt" /></div>
          <div>
            <Label>Due date and time</Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
              <Input type="time" className="w-32" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} aria-label="Due time" />
            </div>
          </div>
          <div>
            <Label>Opens for students</Label>
            <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} aria-label="Opens for students" />
          </div>
          <div><Label>Replies required</Label><Input type="number" min={0} value={required} onChange={(e) => setRequired(e.target.value)} /></div>
          {d.graded && (
            <>
              <div><Label>Points for main response</Label><Input type="number" min={0} value={responsePts} onChange={(e) => setResponsePts(e.target.value)} /></div>
              <div><Label>Points per reply</Label><Input type="number" min={0} value={replyPts} onChange={(e) => setReplyPts(e.target.value)} /></div>
              {d.assignment_id && (
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-disc-category">Grading category</Label>
                  <select id="edit-disc-category" className={SELECT_CLS} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <p className="text-sm sm:col-span-2">Total: <span className="font-semibold">{discussionTotalPossible(Number(responsePts) || 0, Number(replyPts) || 0, Number(required) || 0)} pts</span></p>
            </>
          )}
          {d.share_group && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={allLinked} onChange={(e) => setAllLinked(e.target.checked)} />
              Apply to every class this discussion was posted to
            </label>
          )}
          <p className="text-xs text-muted-foreground sm:col-span-2">Student responses, replies and scores are kept. Students see an "Edited" note.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Thread({ discussion, isStaff }: { discussion: Discussion; isStaff: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const threadId = discussion.thread_id ?? discussion.id;
  const key = ["discussion-posts", threadId];
  const draftKey = `discussion-post:${threadId}`;
  const [body, setBody] = useState(() => readDraft<string>(draftKey) ?? "");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [view, setView] = useState<"thread" | "grade">("thread");
  const draft = useAutosaveDraft(draftKey, body, { dirty: body.trim().length > 0 });

  const { data: posts = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase
        .from("discussion_posts")
        .select("id, body, author_id, parent_id, created_at")
        .eq("discussion_id", threadId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // RLS returns only the viewer's own scores to students; staff see all.
  const { data: scores = [] } = useQuery({
    queryKey: ["discussion-scores", threadId],
    enabled: discussion.graded,
    queryFn: async (): Promise<Score[]> => {
      const { data, error } = await supabase
        .from("discussion_post_scores")
        .select("post_id, author_id, points, max_points")
        .eq("discussion_id", threadId);
      if (error) throw error;
      return data as Score[];
    },
  });

  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const { data: authors = [] } = useQuery({
    queryKey: ["discussion-authors", threadId, authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds);
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
      const { error } = await supabase.from("discussion_posts").insert({ discussion_id: threadId, parent_id: replyTo, author_id: user!.id, body: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody(""); setReplyTo(null); draft.clear();
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
  const scoreOf = (postId: string) => scores.find((s) => s.post_id === postId);
  const myScores = scores.filter((s) => s.author_id === user?.id);
  const myTotal = studentDiscussionTotal(myScores);

  const scoreTag = (post: Post) => {
    const s = scoreOf(post.id);
    if (!discussion.graded || !s) return null;
    if (!isStaff && post.author_id !== user?.id) return null;
    return <Badge variant="secondary" className="ml-2 font-semibold">{formatPoints(Number(s.points), Number(s.max_points))}</Badge>;
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      {isStaff && discussion.graded && (
        <div className="mb-4 inline-flex rounded-md border border-border p-0.5 text-sm" role="tablist">
          <button role="tab" aria-selected={view === "thread"} onClick={() => setView("thread")} className={`rounded px-3 py-1 ${view === "thread" ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            <MessageSquare className="mr-1.5 inline size-3.5" /> Thread
          </button>
          <button role="tab" aria-selected={view === "grade"} onClick={() => setView("grade")} className={`rounded px-3 py-1 ${view === "grade" ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            <ClipboardCheck className="mr-1.5 inline size-3.5" /> Grade by student
          </button>
        </div>
      )}

      {!isStaff && discussion.graded && myTotal !== null && (
        <div className="mb-4 rounded-md border border-border bg-secondary/40 p-3 text-sm">
          Your points: <span className="text-base font-semibold">{formatPoints(myTotal, Number(discussion.points_possible))}</span>
        </div>
      )}

      {view === "grade" && isStaff ? (
        <GradeByStudent discussion={discussion} threadId={threadId} posts={posts} scores={scores} />
      ) : (
        <>
          {isStaff && authorIds.length > 0 && (
            <div className="mb-4 rounded-md bg-secondary/50 p-3 text-xs">
              <p className="flex items-center gap-2 font-medium uppercase tracking-wide text-muted-foreground"><Users className="size-3.5" /> Participation</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {authorIds.map((id) => {
                  const count = posts.filter((p) => p.author_id === id).length;
                  return (
                    <Badge key={id} variant={count >= Math.max(1, discussion.required_replies) ? "secondary" : "outline"}>
                      {nameFor(id)}: {count}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {roots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet — be the first to post.</p>
            ) : (
              roots.map((p) => (
                <div key={p.id} className="rounded-md border border-border p-3">
                  <p className="flex items-center text-xs font-semibold">
                    {nameFor(p.author_id)}
                    <span className="ml-2 font-normal text-muted-foreground">{formatDateTime(p.created_at)}</span>
                    {scoreTag(p)}
                  </p>
                  <FormattedText text={p.body} className="mt-1" />
                  <div className="mt-2 flex gap-3 text-xs">
                    {!discussion.closed || isStaff ? (
                      <button onClick={() => setReplyTo(replyTo === p.id ? null : p.id)} className="text-muted-foreground hover:text-accent">
                        {replyTo === p.id ? "Cancel reply" : "Reply"}
                      </button>
                    ) : null}
                    {(isStaff || p.author_id === user?.id) && (
                      <button onClick={() => { if (window.confirm("Remove this response and its replies?")) remove.mutate(p.id); }} className="text-muted-foreground hover:text-destructive">
                        Remove
                      </button>
                    )}
                  </div>

                  {repliesOf(p.id).length > 0 && (
                    <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
                      {repliesOf(p.id).map((r) => (
                        <div key={r.id} className="py-1">
                          <p className="flex items-center text-xs font-semibold">
                            {nameFor(r.author_id)}
                            <span className="ml-2 font-normal text-muted-foreground">{formatDateTime(r.created_at)}</span>
                            {scoreTag(r)}
                          </p>
                          <FormattedText text={r.body} className="mt-1" />
                          {(isStaff || r.author_id === user?.id) && (
                            <button onClick={() => { if (window.confirm("Remove this reply?")) remove.mutate(r.id); }} className="mt-1 text-xs text-muted-foreground hover:text-destructive">
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
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Respond to ideas, not people. Keep personal details private — your name shows on every post.
              </p>
              {replyTo ? (
                <p className="mb-1 text-xs text-muted-foreground">Replying to {nameFor(posts.find((p) => p.id === replyTo)?.author_id ?? "")}</p>
              ) : null}
              <FormattedEditor
                value={body}
                onChange={setBody}
                maxLength={POST_MAX_LENGTH}
                rows={3}
                ariaLabel={replyTo ? "Your reply" : "Your response"}
                placeholder={replyTo ? "Write your reply…" : "Post your response to the prompt…"}
              />
              <div className="mt-2 flex items-center gap-3">
                <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={body.trim().length > 0} />
                <Button size="sm" className="ml-auto" onClick={() => add.mutate()} disabled={add.isPending}>
                  {replyTo ? "Reply" : "Post response"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">This discussion is closed.</p>
          )}
        </>
      )}
    </div>
  );
}

function GradeByStudent({
  discussion: d,
  threadId,
  posts,
  scores,
}: {
  discussion: Discussion;
  threadId: string;
  posts: Post[];
  scores: Score[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Record<string, string>>({});

  const { data: roster = [] } = useQuery({
    queryKey: ["discussion-roster", d.class_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("students(id, first_name, last_name, user_id, is_tester)")
        .eq("class_id", d.class_id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.students)
        .filter((s): s is NonNullable<typeof s> => !!s)
        .sort((a, b) => Number(a.is_tester) - Number(b.is_tester) || a.last_name.localeCompare(b.last_name));
    },
  });


  const saveStudent = useMutation({
    mutationFn: async (student: { id: string; user_id: string | null }) => {
      if (!student.user_id) throw new Error("This student has no account yet");
      const mine = posts.filter((p) => p.author_id === student.user_id);
      for (const p of mine) {
        const raw = pending[p.id];
        if (raw === undefined) continue;
        const max = maxFor(d, !!p.parent_id);
        if (raw.trim() === "") {
          const { error } = await supabase.from("discussion_post_scores").delete().eq("post_id", p.id);
          if (error) throw error;
          continue;
        }
        const pts = Number(raw);
        if (!Number.isFinite(pts) || pts < 0) throw new Error("Scores must be 0 or more");
        const { error } = await supabase.from("discussion_post_scores").upsert(
          { post_id: p.id, discussion_id: threadId, author_id: student.user_id, points: pts, max_points: max, graded_by: user!.id },
          { onConflict: "post_id" },
        );
        if (error) throw error;
      }
      // Recompute the total from saved scores and sync to this class's gradebook.
      const { data: saved, error: sErr } = await supabase
        .from("discussion_post_scores")
        .select("points, post_id")
        .eq("discussion_id", threadId)
        .eq("author_id", student.user_id);
      if (sErr) throw sErr;
      const total = studentDiscussionTotal(saved ?? []);
      if (d.assignment_id && total !== null) {
        const { error } = await supabase.from("grades").upsert(
          { assignment_id: d.assignment_id, student_id: student.id, points_earned: total, is_draft: false, posted_at: new Date().toISOString(), posted_by: user!.id },
          { onConflict: "assignment_id,student_id" },
        );
        if (error) throw error;
      }
      return { ids: mine.map((p) => p.id), total };
    },
    onSuccess: ({ ids, total }) => {
      setPending((prev) => {
        const n = { ...prev };
        ids.forEach((i) => delete n[i]);
        return n;
      });
      queryClient.invalidateQueries({ queryKey: ["discussion-scores", threadId] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      toast.success(total !== null ? `Saved — ${formatPoints(total, Number(d.points_possible))} posted to the gradebook` : "Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scoreInput = (post: Post) => {
    const s = scores.find((x) => x.post_id === post.id);
    const max = maxFor(d, !!post.parent_id);
    const value = pending[post.id] ?? (s ? String(s.points) : "");
    return (
      <div key={post.id} className="flex shrink-0 items-center gap-1 text-sm">
        <Input
          type="number"
          min={0}
          step="0.5"
          value={value}
          onChange={(e) => setPending((p) => ({ ...p, [post.id]: e.target.value }))}
          className="h-8 w-16 text-right"
          aria-label={post.parent_id ? "Reply score" : "Response score"}
        />
        <span className="text-muted-foreground">/ {max}</span>
      </div>
    );
  };

  if (roster.length === 0) return <p className="text-sm text-muted-foreground">No students enrolled in this class.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Main response up to {maxFor(d, false)} pts · each reply up to {maxFor(d, true)} pts · {d.required_replies} repl{d.required_replies === 1 ? "y" : "ies"} required. Saving posts the total to the gradebook.
      </p>
      {roster.map((st) => {
        const mine = posts.filter((p) => p.author_id === st.user_id);
        const main = mine.filter((p) => !p.parent_id);
        const replies = mine.filter((p) => p.parent_id);
        const saved = scores.filter((s) => s.author_id === st.user_id);
        const total = studentDiscussionTotal(saved);
        const status = main.length === 0 ? "Missing" : replies.length >= d.required_replies ? "Complete" : "Partial";
        const dirty = mine.some((p) => pending[p.id] !== undefined);
        return (
          <section key={st.id} className="rounded-md border border-border p-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{st.last_name}, {st.first_name}</h4>
                <Badge variant={status === "Complete" ? "secondary" : "outline"}>{status}</Badge>
                {st.is_tester ? <Badge variant="outline">Test account</Badge> : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">Total <span className="text-base font-semibold">{formatPoints(total, Number(d.points_possible))}</span></span>
                {mine.length > 0 && (
                  <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saveStudent.isPending} onClick={() => saveStudent.mutate(st)}>
                    Save scores
                  </Button>
                )}
              </div>
            </header>
            {mine.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No posts yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {main.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 rounded bg-secondary/40 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Response · {formatDateTime(p.created_at)}</p>
                      <FormattedText text={p.body} className="mt-1" />
                    </div>
                    {scoreInput(p)}
                  </div>
                ))}
                {replies.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 border-l-2 border-border pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Reply · {formatDateTime(p.created_at)}
                      </p>
                      <FormattedText text={p.body} className="mt-1" />
                    </div>
                    {scoreInput(p)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
