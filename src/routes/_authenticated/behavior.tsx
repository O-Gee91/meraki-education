import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/school";

export const Route = createFileRoute("/_authenticated/behavior")({
  head: () => ({
    meta: [
      { title: "Behavior notes — Meraki Education" },
      {
        name: "description",
        content: "Log positive recognition and concerns, shared with guardians.",
      },
      { property: "og:title", content: "Behavior notes — Meraki Education" },
      {
        property: "og:description",
        content: "Log positive recognition and concerns, shared with guardians.",
      },
    ],
  }),
  component: BehaviorPage,
});

const KINDS = ["positive", "concern", "incident"] as const;

function BehaviorPage() {
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ studentId: "", kind: "positive", note: "", date: "" });

  const { data: notes = [] } = useQuery({
    queryKey: ["behavior"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("behavior_notes")
        .select("id, kind, notes, date, students(first_name, last_name)")
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.studentId) throw new Error("Pick a student");
      if (form.note.trim().length < 4) throw new Error("Add a short note");
      const { error } = await supabase.from("behavior_notes").insert({
        student_id: form.studentId,
        kind: form.kind,
        notes: form.note.trim().slice(0, 1000),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note logged");
      setForm({ studentId: "", kind: "positive", note: "", date: "" });
      queryClient.invalidateQueries({ queryKey: ["behavior"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Behavior"
      description="A shared record of recognition and concerns for each student."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {isStaff && (
          <section className="panel h-fit p-5">
            <h2 className="text-lg font-semibold">Log a note</h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="student">Student</Label>
                <Select
                  value={form.studentId}
                  onValueChange={(v) => setForm({ ...form, studentId: v })}
                >
                  <SelectTrigger id="student">
                    <SelectValue placeholder="Choose a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.last_name}, {s.first_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kind">Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                {create.isPending ? "Saving…" : "Log note"}
              </Button>
            </div>
          </section>
        )}

        <section className={`panel divide-y divide-border ${isStaff ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {notes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No behavior notes recorded.</p>
          ) : (
            notes.map((n) => (
              <article key={n.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={n.kind === "positive" ? "default" : "secondary"}>{n.kind}</Badge>
                  <span className="text-sm font-medium">
                    {n.students?.last_name}, {n.students?.first_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(n.date)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{n.notes}</p>
              </article>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
