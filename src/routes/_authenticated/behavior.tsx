import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherScope } from "@/hooks/useTeacherScope";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/school";
import {
  NOTE_KINDS,
  kindLabel,
  reasonLabel,
  reasonsFor,
} from "@/lib/behavior-reasons";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";


export const Route = createFileRoute("/_authenticated/behavior")({
  head: () => ({
    meta: [
      { title: "Behavior & strikes — Meraki Education" },
      {
        name: "description",
        content:
          "Log recognition and concerns, track a three-strike system and auto-schedule detention with family notifications.",
      },
      { property: "og:title", content: "Behavior & strikes — Meraki Education" },
      {
        property: "og:description",
        content:
          "Three-strike behavior tracking that notifies students, guardians and admins when detention is required.",
      },
    ],
  }),
  component: BehaviorPage,
});

function kindTone(kind: string) {
  if (kind === "positive") return "default";
  if (kind === "strike") return "destructive";
  return "secondary";
}


function BehaviorPage() {
  const { isStaff, primaryRole } = useAuth();
  const isStudent = primaryRole === "student";

  return (
    <AppShell
      title={isStudent ? "My behavior" : "Behavior & strikes"}
      description={
        isStudent
          ? "Shout-outs you have earned, notes your teachers have logged, and any strikes or detention scheduled for you."
          : "Shared with every teacher of the grade — recognition, concerns and a three-strike system that schedules detention automatically."
      }
    >
      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">{isStudent ? "My log" : "Behavior log"}</TabsTrigger>
          <TabsTrigger value="strikes">{isStudent ? "My strikes" : "Strike tracker"}</TabsTrigger>
          <TabsTrigger value="detentions">{isStudent ? "My detentions" : "Detentions"}</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <BehaviorLog isStaff={isStaff} />
        </TabsContent>
        <TabsContent value="strikes">
          <StrikeTracker />
        </TabsContent>
        <TabsContent value="detentions">
          <Detentions isStaff={isStaff} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function useNotes() {
  return useQuery({
    queryKey: ["behavior"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("behavior_notes")
        .select(
          "id, kind, reason, assignment_id, scored_zero, notes, date, student_id, students(first_name, last_name, grade_level), assignments(title)",
        )

        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

function BehaviorLog({ isStaff }: { isStaff: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    studentId: "",
    kind: "positive",
    reason: "",
    assignmentId: "",
    markZero: true,
    note: "",
    date: "",
  });

  const { data: notes = [] } = useNotes();
  const [gradeFilter, setGradeFilter] = useState("all");
  const [sortMode, setSortMode] = useStudentSort("behavior-student-picker");

  const grades = useMemo(
    () =>
      [...new Set(notes.map((n) => n.students?.grade_level).filter((g): g is number => !!g))].sort(
        (a, b) => a - b,
      ),
    [notes],
  );
  const visibleNotes = useMemo(
    () =>
      gradeFilter === "all"
        ? notes
        : notes.filter((n) => String(n.students?.grade_level ?? "") === gradeFilter),
    [notes, gradeFilter],
  );

  const { studentIds } = useTeacherScope();
  const { data: allStudents = [] } = useQuery({
    queryKey: ["students"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });
  // Teacher mode limits logging to students this person actually teaches.
  const students = sortStudents(
    studentIds ? allStudents.filter((s) => studentIds.has(s.id)) : allStudents,
    sortMode,
  );


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
      return form.kind;
    },
    onSuccess: (kind) => {
      toast.success(
        kind === "strike"
          ? "Strike logged — every third strike schedules detention and notifies the family"
          : "Note logged",
      );
      setForm({ studentId: "", kind: form.kind, note: "", date: "" });
      queryClient.invalidateQueries({ queryKey: ["behavior"] });
      queryClient.invalidateQueries({ queryKey: ["detentions"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-3">
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
                      {s.grade_level ? ` · Grade ${s.grade_level}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StudentSortControl
                value={sortMode}
                onChange={setSortMode}
                className="w-full"
              />
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
                      {k === "strike" ? "strike (counts toward detention)" : k}
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
            <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Log note"}
            </Button>
            {form.kind === "strike" ? (
              <p className="text-xs text-muted-foreground">
                Three strikes automatically schedules detention and messages the student, their
                guardian and administrators.
              </p>
            ) : null}
          </div>
        </section>
      )}

      <section
        className={`panel divide-y divide-border ${isStaff ? "lg:col-span-2" : "lg:col-span-3"}`}
      >
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-semibold">Grade-wide behavior log</p>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="ml-auto w-40" aria-label="Filter by grade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my grades</SelectItem>
              {grades.map((g) => (
                <SelectItem key={g} value={String(g)}>
                  Grade {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {visibleNotes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No behavior notes recorded.</p>
        ) : (
          visibleNotes.map((n) => <NoteRow key={n.id} note={n} isStaff={isStaff} />)
        )}
      </section>
    </div>
  );
}

type NoteRecord = {
  id: string;
  kind: string;
  notes: string | null;
  date: string;
  student_id: string;
  students: { first_name: string; last_name: string; grade_level?: number | null } | null;
};

function NoteRow({ note, isStaff }: { note: NoteRecord; isStaff: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    kind: note.kind,
    date: note.date,
    notes: note.notes ?? "",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["behavior"] });
    queryClient.invalidateQueries({ queryKey: ["detentions"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (draft.notes.trim().length < 4) throw new Error("Add a short note");
      const { error } = await supabase
        .from("behavior_notes")
        .update({
          kind: draft.kind,
          date: draft.date,
          notes: draft.notes.trim().slice(0, 1000),
        })
        .eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note updated");
      setEditing(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("behavior_notes").delete().eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <article className="space-y-3 p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind })}>
            <SelectTrigger className="w-56">
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
          <Input
            type="date"
            className="w-40"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </div>
        <Textarea
          value={draft.notes}
          maxLength={1000}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={kindTone(note.kind)}>{note.kind}</Badge>
        <span className="text-sm font-medium">
          {note.students?.last_name}, {note.students?.first_name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(note.date)}
          {note.students?.grade_level ? ` · Grade ${note.students.grade_level}` : ""}
        </span>
        {isStaff && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{note.notes}</p>
    </article>
  );
}


function StrikeTracker() {
  const { data: notes = [] } = useNotes();

  const rows = useMemo(() => {
    const map = new Map<string, { name: string; strikes: number; last: string }>();
    for (const n of notes) {
      if (n.kind !== "strike") continue;
      const name = `${n.students?.last_name ?? "Student"}, ${n.students?.first_name ?? ""}`;
      const current = map.get(n.student_id);
      if (current) {
        current.strikes += 1;
        if (n.date > current.last) current.last = n.date;
      } else {
        map.set(n.student_id, { name, strikes: 1, last: n.date });
      }
    }
    return [...map.values()].sort((a, b) => b.strikes - a.strikes);
  }, [notes]);

  return (
    <div className="panel mt-4 p-5">
      <h2 className="text-sm font-semibold">Three-strike tracker</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Strikes reset in cycles of three — reaching the third strike schedules detention.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No strikes on record. </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((r) => {
            const inCycle = r.strikes % 3 === 0 ? 3 : r.strikes % 3;
            return (
              <li key={r.name} className="flex flex-wrap items-center gap-3 py-3">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={
                        "h-2.5 w-6 rounded-full " +
                        (i <= inCycle ? "bg-destructive" : "bg-secondary")
                      }
                    />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {inCycle}/3 in current cycle · {r.strikes} total · last {formatDate(r.last)}
                </span>
                {inCycle === 3 ? (
                  <Badge variant="destructive" className="ml-auto">
                    Detention required
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const STATUSES = ["scheduled", "served", "waived"] as const;

function Detentions({ isStaff }: { isStaff: boolean }) {
  const queryClient = useQueryClient();

  const { data: detentions = [] } = useQuery({
    queryKey: ["detentions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detentions")
        .select(
          "id, reason, strike_count, scheduled_date, status, notes, created_at, students(first_name, last_name, guardian_email)",
        )
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { status?: string; scheduled_date?: string; reason?: string; notes?: string };
    }) => {
      const { error } = await supabase.from("detentions").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Detention updated");
      queryClient.invalidateQueries({ queryKey: ["detentions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("detentions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Detention deleted");
      queryClient.invalidateQueries({ queryKey: ["detentions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detentions.length === 0) {
    return (
      <p className="panel mt-4 p-6 text-sm text-muted-foreground">
        No detentions scheduled. They are created automatically when a student reaches three
        strikes.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {detentions.map((d) => (
        <article key={d.id} className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-52">
            <p className="text-sm font-semibold">
              {d.students?.last_name}, {d.students?.first_name}
            </p>
            <p className="text-xs text-muted-foreground">{d.reason}</p>
          </div>
          <Badge variant="destructive">{d.strike_count} strikes</Badge>
          <span className="text-xs text-muted-foreground">
            Scheduled {formatDate(d.scheduled_date)}
          </span>
          {isStaff ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-40"
                defaultValue={d.scheduled_date}
                onChange={(e) =>
                  e.target.value && update.mutate({ id: d.id, patch: { scheduled_date: e.target.value } })
                }
              />
              <Select
                value={d.status}
                onValueChange={(status) => update.mutate({ id: d.id, patch: { status } })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-56"
                placeholder="Reason"
                defaultValue={d.reason ?? ""}
                onBlur={(e) => {
                  const reason = e.target.value.trim();
                  if (reason && reason !== d.reason)
                    update.mutate({ id: d.id, patch: { reason } });
                }}
              />
              <Input
                className="w-56"
                placeholder="Staff notes"
                defaultValue={d.notes ?? ""}
                onBlur={(e) => {
                  const notes = e.target.value.trim();
                  if (notes !== (d.notes ?? "")) update.mutate({ id: d.id, patch: { notes } });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(d.id)}
              >
                Delete
              </Button>
            </div>
          ) : (

            <Badge variant="outline" className="ml-auto">
              {d.status}
            </Badge>
          )}
        </article>
      ))}
    </div>
  );
}
