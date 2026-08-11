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
  const [post, setPost] = useState({ title: "", body: "" });

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
        .select("id, title, body, created_at")
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
      const { error } = await supabase.from("messages").insert({
        sender_id: user!.id,
        recipient_id: compose.recipient,
        subject: compose.subject.trim().slice(0, 140),
        body: compose.body.trim().slice(0, 4000),
      });
      if (error) throw error;
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
        author_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement posted");
      setPost({ title: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameFor = (id: string) => people.find((p) => p.id === id)?.full_name ?? "You";

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
                    <h3 className="text-sm font-semibold">{a.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {a.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
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
