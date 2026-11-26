import { useState } from "react";
import { usePagedLimit } from "@/lib/paged";
import { ShowOlder } from "@/components/ShowOlder";
import { Megaphone, Pencil, Send } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { NotebookSentIcon, NotebookEmpty } from "@/components/NotebookDecorations";
import { useNotebookStyle } from "@/components/NotebookStyle";
import { useAuth } from "@/hooks/useAuth";
import { PREVIEW_READ_ONLY } from "@/hooks/useStudentPreview";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/school";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { AUDIENCES, audienceLabel } from "@/lib/audience";
import { notifyMessageRecipient } from "@/lib/messaging.functions";
import { compareStudentNames } from "@/lib/student-sort";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Meraki Education" },
      {
        name: "description",
        content: "Direct messages between staff, students and guardians, plus school announcements.",
      },
      { property: "og:title", content: "Messages — Meraki Education" },
      {
        property: "og:description",
        content: "Direct messages between staff, students and guardians, plus school announcements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user, isStaff, previewingStudent } = useAuth();
  const notebookStyle = useNotebookStyle();
  const queryClient = useQueryClient();
  const [compose, setCompose] = useState({ recipient: "", subject: "", body: "" });
  const [post, setPost] = useState({ title: "", body: "", audience: "everyone" });

  const inboxPage = usePagedLimit(150);
  const { data: inbox = [], isFetching: inboxFetching } = useQuery({
    // Student view never shows the staff member's own private inbox.
    queryKey: ["messages", user?.id, inboxPage.limit],
    placeholderData: (prev) => prev,
    enabled: Boolean(user) && !previewingStudent,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, subject, body, created_at, read, read_at, sender_id, recipient_id")
        .order("created_at", { ascending: false })
        .limit(inboxPage.limit);
      if (error) throw error;
      return data;
    },
  });

  // Staff may browse everyone; students and guardians only see their teachers and school admins.
  const { data: people = [] } = useQuery({
    queryKey: ["message-contacts", isStaff],
    enabled: Boolean(user),
    queryFn: async () => {
      if (isStaff) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name")
          .order("full_name");
        if (error) throw error;
        return data.filter((p) => p.id !== user?.id).map((p) => ({ ...p, label: "" as string | null }));
      }
      const { data, error } = await supabase.rpc("message_contacts");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["message-participants", user?.id, inbox.length],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("message_participant_names");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const received = inbox.filter((m) => m.recipient_id === user?.id);
  const sent = inbox.filter((m) => m.sender_id === user?.id);
  const unreadCount = received.filter((m) => !m.read).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
    },
  });

  const openMessage = (m: (typeof inbox)[number]) => {
    setOpenId(openId === m.id ? null : m.id);
    if (m.recipient_id === user?.id && !m.read) markRead.mutate(m.id);
  };

  const reply = (m: (typeof inbox)[number]) => {
    setPickMode("person");
    setCompose({
      recipient: m.sender_id,
      subject: m.subject.startsWith("Re: ") ? m.subject : `Re: ${m.subject}`.slice(0, 140),
      body: "",
    });
    document.getElementById("subject")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const annPage = usePagedLimit(30);
  const { data: announcements = [], isFetching: annFetching } = useQuery({
    queryKey: ["announcements", annPage.limit],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at, audience, author_id")
        .order("created_at", { ascending: false })
        .limit(annPage.limit);
      if (error) throw error;
      return data;
    },
  });

  const [pickMode, setPickMode] = useState<"class" | "person">("class");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [target, setTarget] = useState<"student" | "parent" | "both">("student");

  const { data: classes = [] } = useQuery({
    queryKey: ["message-classes"],
    enabled: Boolean(isStaff),
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, period").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["message-roster", classId],
    enabled: Boolean(isStaff && classId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("students(id, first_name, last_name, chinese_name, user_id, guardian_user_id, is_tester)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.students)
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort((a, b) => compareStudentNames(a, b));
    },
  });

  const chosenStudent = roster.find((s) => s.id === studentId);
  const classRecipients = (() => {
    if (!chosenStudent) return [] as string[];
    const ids: (string | null)[] = [];
    if (target !== "parent") ids.push(chosenStudent.user_id);
    if (target !== "student") ids.push(chosenStudent.guardian_user_id);
    return [...new Set(ids.filter(Boolean) as string[])];
  })();

  const send = useMutation({
    mutationFn: async () => {
      if (previewingStudent) throw new Error(PREVIEW_READ_ONLY);
      const recipients = isStaff && pickMode === "class" ? classRecipients : compose.recipient ? [compose.recipient] : [];
      if (recipients.length === 0)
        throw new Error(
          isStaff && pickMode === "class" && chosenStudent
            ? "This person has no login yet — they can't receive messages"
            : "Choose a recipient",
        );
      if (compose.subject.trim().length < 2) throw new Error("Add a subject");
      if (compose.body.trim().length < 2) throw new Error("Write a message");
      const { data: inserted, error } = await supabase
        .from("messages")
        .insert(
          recipients.map((recipient_id) => ({
            sender_id: user!.id,
            recipient_id,
            subject: compose.subject.trim().slice(0, 140),
            body: compose.body.trim().slice(0, 4000),
          })),
        )
        .select("id");
      if (error) throw error;
      // Also deliver it to each recipient's email inbox (best effort).
      for (const row of inserted ?? []) {
        try {
          await notifyMessageRecipient({ data: { message_id: row.id } });
        } catch (err) {
          console.error("Message email notification failed", err);
        }
      }
      return recipients.length;
    },
    onSuccess: (count) => {
      toast.success(count > 1 ? `Message sent to ${count} people` : "Message sent", notebookStyle === "notebook" ? { icon: <NotebookSentIcon /> } : {});
      setCompose({ recipient: "", subject: "", body: "" });
      setStudentId("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const announce = useMutation({
    mutationFn: async () => {
      if (previewingStudent) throw new Error(PREVIEW_READ_ONLY);
      if (post.title.trim().length < 3) throw new Error("Add a title");
      if (post.body.trim().length < 3) throw new Error("Add announcement text");
      const { error } = await supabase.from("announcements").insert({
        title: post.title.trim().slice(0, 140),
        body: post.body.trim().slice(0, 4000),
        audience: post.audience as "everyone" | "students" | "parents" | "teachers",
        author_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement posted");
      setPost({ title: "", body: "", audience: post.audience });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameFor = (id: string) =>
    participants.find((p) => p.id === id)?.full_name ??
    people.find((p) => p.id === id)?.full_name ??
    "Unknown sender";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", body: "", audience: "everyone" });

  const saveAnnouncement = useMutation({
    mutationFn: async () => {
      if (previewingStudent) throw new Error(PREVIEW_READ_ONLY);
      if (!editingId) return;
      if (editDraft.title.trim().length < 3) throw new Error("Add a title");
      if (editDraft.body.trim().length < 3) throw new Error("Add announcement text");
      const { error } = await supabase
        .from("announcements")
        .update({
          title: editDraft.title.trim().slice(0, 140),
          body: editDraft.body.trim().slice(0, 4000),
          audience: editDraft.audience as "everyone" | "students" | "parents" | "teachers",
        })
        .eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement updated");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement deleted");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      desktopReview
      title={isStaff ? "Communications" : "My messages"}
      description={
        isStaff
          ? "Messages and school-wide announcements."
          : "Messages with your teachers and announcements from your school."
      }
    >
      <Tabs defaultValue="inbox">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pb-3">
          <TabsTrigger value="inbox">{isStaff ? "Messages" : "My inbox"}</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <div className="mt-6 grid min-w-0 items-start gap-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <section className="min-w-0 border-t border-border pt-5">
              <h2 className="notebook-heading text-lg font-semibold">New message</h2>
              <div className="mt-4 space-y-3">
                {isStaff && (
                  <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1" role="group" aria-label="How to choose recipient">
                    <Button type="button" size="sm" variant={pickMode === "class" ? "secondary" : "ghost"} onClick={() => setPickMode("class")}>
                      By class
                    </Button>
                    <Button type="button" size="sm" variant={pickMode === "person" ? "secondary" : "ghost"} onClick={() => setPickMode("person")}>
                      Anyone
                    </Button>
                  </div>
                )}
                {isStaff && pickMode === "class" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="msg-class">Class</Label>
                      <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(""); }}>
                        <SelectTrigger id="msg-class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}{c.period ? ` · ${c.period}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="msg-student">Student</Label>
                      <Select value={studentId} onValueChange={setStudentId} disabled={!classId}>
                        <SelectTrigger id="msg-student"><SelectValue placeholder={classId ? "Choose a student" : "Pick a class first"} /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          {roster.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.last_name}, {s.first_name}{s.chinese_name ? ` ${s.chinese_name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Send to</Label>
                      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Send to">
                        {(["student", "parent", "both"] as const).map((t) => (
                          <Button key={t} type="button" size="sm" variant={target === t ? "default" : "outline"} onClick={() => setTarget(t)}>
                            {t === "student" ? "Student" : t === "parent" ? "Parent" : "Both"}
                          </Button>
                        ))}
                      </div>
                      {chosenStudent && (
                        <p className="text-xs text-muted-foreground">
                          Student login {chosenStudent.user_id ? "✓" : "— none"} · Parent login {chosenStudent.guardian_user_id ? "✓" : "— none"}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="recipient">To</Label>
                  <Select
                    value={compose.recipient}
                    onValueChange={(v) => setCompose({ ...compose, recipient: v })}
                  >
                    <SelectTrigger id="recipient" className="min-w-0 [&>span]:min-w-0">
                      <SelectValue placeholder="Choose a person" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-3rem)]">
                      {compose.recipient && !people.some((p) => p.id === compose.recipient) && (
                        <SelectItem value={compose.recipient}>{nameFor(compose.recipient)}</SelectItem>
                      )}
                      {people.length === 0 && !compose.recipient && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">No teachers found for your classes yet.</p>
                      )}
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="[overflow-wrap:anywhere] [&>span:last-child]:min-w-0">
                          {p.full_name}{p.label ? ` — ${p.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={compose.subject}
                    maxLength={140}
                    onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="body">Message</Label>
                  <Textarea
                    id="body"
                    rows={5}
                    value={compose.body}
                    maxLength={4000}
                    onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                  />
                </div>
                <Button className="w-full" onClick={() => send.mutate()} disabled={send.isPending}>
                  <Send className="size-4" aria-hidden="true" />
                  {send.isPending ? "Sending…" : "Send message"}
                </Button>
              </div>
            </section>

            <section aria-label="Messages" className="min-w-0 divide-y divide-border border-t border-border">
              <div className="flex flex-wrap items-center gap-1 py-4" role="group" aria-label="Folder">
                <Button size="sm" variant={folder === "inbox" ? "secondary" : "ghost"} onClick={() => setFolder("inbox")}>
                  Inbox{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
                </Button>
                <Button size="sm" variant={folder === "sent" ? "secondary" : "ghost"} onClick={() => setFolder("sent")}>
                  Sent
                </Button>
              </div>
              {(folder === "inbox" ? received : sent).length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  {folder === "inbox" ? "No messages received yet." : "You haven't sent any messages yet."}
                </p>
              ) : (
                (folder === "inbox" ? received : sent).map((m) => {
                  const incoming = m.recipient_id === user?.id;
                  const unread = incoming && !m.read;
                  const open = openId === m.id;
                  return (
                    <article key={m.id} className="min-w-0 py-4 [overflow-wrap:anywhere]">
                      <button
                        type="button"
                        onClick={() => openMessage(m)}
                        aria-expanded={open}
                        className="block w-full text-left"
                      >
                        <div className="flex items-start gap-2">
                          {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                          <h3 className={`text-base ${unread ? "font-bold" : "font-semibold"}`}>{m.subject}</h3>
                        </div>
                        <div className="mt-1.5 grid min-w-0 gap-1 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                          <span>{incoming ? `From ${nameFor(m.sender_id)}` : `To ${nameFor(m.recipient_id)}`}</span>
                          <span className="whitespace-nowrap">{formatDate(m.created_at)}</span>
                        </div>
                        {!open && (
                          <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{m.body}</p>
                        )}
                      </button>
                      {open && (
                        <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                          {m.body}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {!incoming && (
                          <Badge variant="outline" className="font-normal">
                            {m.read ? `Read${m.read_at ? ` ${formatDate(m.read_at)}` : ""}` : "Not read yet"}
                          </Badge>
                        )}
                        {incoming && open && (
                          <Button size="sm" variant="outline" onClick={() => reply(m)}>Reply</Button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
              <ShowOlder show={inboxPage.hasMore(inbox.length)} loading={inboxFetching} onClick={inboxPage.showMore} label="Show older messages" />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="announcements">
          <div className={`mt-6 grid min-w-0 items-start gap-8 ${isStaff ? "xl:grid-cols-[20rem_minmax(0,1fr)]" : ""}`}>
            {isStaff && (
              <section className="min-w-0 border-t border-border pt-5">
                <h2 className="notebook-heading text-lg font-semibold">Post announcement</h2>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={post.title}
                      maxLength={140}
                      onChange={(e) => setPost({ ...post, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="audience">Who can see this</Label>
                    <Select
                      value={post.audience}
                      onValueChange={(audience) => setPost({ ...post, audience })}
                    >
                      <SelectTrigger id="audience">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCES.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="announcement">Details</Label>
                    <Textarea
                      id="announcement"
                      rows={5}
                      value={post.body}
                      maxLength={4000}
                      onChange={(e) => setPost({ ...post, body: e.target.value })}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => announce.mutate()}
                    disabled={announce.isPending}
                  >
                    <Megaphone className="size-4" aria-hidden="true" />
                    {announce.isPending ? "Posting…" : "Post"}
                  </Button>
                </div>
              </section>
            )}
            <section
              aria-label="School announcements"
              className="notebook-cork min-w-0 divide-y divide-border border-t border-border"
            >
              <h2 className="notebook-heading py-5 text-lg font-semibold">School announcements</h2>
              {announcements.length === 0 ? (
                <NotebookEmpty className="py-6 text-sm text-muted-foreground">No announcements yet.</NotebookEmpty>
              ) : (
                announcements.map((a) => (
                  <article key={a.id} className="notebook-paper notebook-pin min-w-0 py-5 [overflow-wrap:anywhere]">
                    {editingId === a.id ? (
                      <div className="space-y-3">
                        <Input
                          aria-label="Announcement title"
                          value={editDraft.title}
                          maxLength={140}
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                        />
                        <Select
                          value={editDraft.audience}
                          onValueChange={(audience) => setEditDraft({ ...editDraft, audience })}
                        >
                          <SelectTrigger aria-label="Announcement audience">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIENCES.map((aud) => (
                              <SelectItem key={aud.value} value={aud.value}>
                                {aud.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Textarea
                          aria-label="Announcement details"
                          rows={4}
                          value={editDraft.body}
                          maxLength={4000}
                          onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveAnnouncement.mutate()}
                            disabled={saveAnnouncement.isPending}
                          >
                            {saveAnnouncement.isPending ? "Saving…" : "Save changes"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="notebook-data text-base font-semibold">{a.title}</h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Badge variant="outline" className="max-w-full whitespace-normal font-normal text-muted-foreground">
                                {audienceLabel(a.audience)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
                            </div>
                          </div>
                          {isStaff && (
                            <span className="flex shrink-0 gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit announcement"
                                title="Edit announcement"
                                className="size-8"
                                onClick={() => {
                                  setEditingId(a.id);
                                  setEditDraft({ title: a.title, body: a.body, audience: a.audience });
                                }}
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                              </Button>
                              <ConfirmDeleteButton
                                title="Delete announcement?"
                                description={`"${a.title}" will be permanently removed.`}
                                onConfirm={() => deleteAnnouncement.mutate(a.id)}
                                disabled={deleteAnnouncement.isPending}
                              />
                            </span>
                          )}
                        </div>
                        <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                          {a.body}
                        </p>
                      </>
                    )}
                  </article>
                ))
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
