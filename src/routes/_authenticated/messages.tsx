import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
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
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [compose, setCompose] = useState({ recipient: "", subject: "", body: "" });
  const [post, setPost] = useState({ title: "", body: "", audience: "everyone" });

  const { data: inbox = [] } = useQuery({
    queryKey: ["messages", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, subject, body, created_at, read, sender_id, recipient_id")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data.filter((p) => p.id !== user?.id);
    },
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at, audience, author_id")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!compose.recipient) throw new Error("Choose a recipient");
      if (compose.subject.trim().length < 2) throw new Error("Add a subject");
      if (compose.body.trim().length < 2) throw new Error("Write a message");
      const { data: inserted, error } = await supabase
        .from("messages")
        .insert({
          sender_id: user!.id,
          recipient_id: compose.recipient,
          subject: compose.subject.trim().slice(0, 140),
          body: compose.body.trim().slice(0, 4000),
        })
        .select("id")
        .single();
      if (error) throw error;
      // Also deliver it to the recipient's email inbox (best effort).
      try {
        await notifyMessageRecipient({ data: { message_id: inserted.id } });
      } catch (err) {
        console.error("Message email notification failed", err);
      }
    },
    onSuccess: () => {
      toast.success("Message sent");
      setCompose({ recipient: "", subject: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const announce = useMutation({
    mutationFn: async () => {
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

  const nameFor = (id: string) => people.find((p) => p.id === id)?.full_name ?? "You";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", body: "", audience: "everyone" });

  const saveAnnouncement = useMutation({
    mutationFn: async () => {
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
    <AppShell title="Communications" description="Messages and school-wide announcements.">
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Messages</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <section className="panel h-fit p-5">
              <h2 className="text-lg font-semibold">New message</h2>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="recipient">To</Label>
                  <Select
                    value={compose.recipient}
                    onValueChange={(v) => setCompose({ ...compose, recipient: v })}
                  >
                    <SelectTrigger id="recipient">
                      <SelectValue placeholder="Choose a person" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  {send.isPending ? "Sending…" : "Send message"}
                </Button>
              </div>
            </section>

            <section className="panel divide-y divide-border lg:col-span-2">
              {inbox.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                inbox.map((m) => (
                  <article key={m.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-semibold">{m.subject}</h3>
                      <Badge variant="secondary">
                        {m.sender_id === user?.id ? `To ${nameFor(m.recipient_id)}` : `From ${nameFor(m.sender_id)}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                      {m.body}
                    </p>
                  </article>
                ))
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="announcements">
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            {isStaff && (
              <section className="panel h-fit p-5">
                <h2 className="text-lg font-semibold">Post announcement</h2>
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
                    {announce.isPending ? "Posting…" : "Post"}
                  </Button>
                </div>
              </section>
            )}
            <section
              className={`panel divide-y divide-border ${isStaff ? "lg:col-span-2" : "lg:col-span-3"}`}
            >
              {announcements.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <article key={a.id} className="p-4">
                    {editingId === a.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editDraft.title}
                          maxLength={140}
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                        />
                        <Select
                          value={editDraft.audience}
                          onValueChange={(audience) => setEditDraft({ ...editDraft, audience })}
                        >
                          <SelectTrigger>
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
                          rows={4}
                          value={editDraft.body}
                          maxLength={4000}
                          onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{a.title}</h3>
                          <Badge variant={a.audience === "everyone" ? "secondary" : "outline"}>
                            {audienceLabel(a.audience)}
                          </Badge>
                          {isStaff && (
                            <span className="ml-auto flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingId(a.id);
                                  setEditDraft({ title: a.title, body: a.body, audience: a.audience });
                                }}
                              >
                                Edit
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
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                          {a.body}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(a.created_at)}
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
