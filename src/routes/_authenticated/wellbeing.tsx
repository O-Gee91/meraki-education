import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/hooks/useAuth";
import { useTeacherScope } from "@/hooks/useTeacherScope";

import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";

export const Route = createFileRoute("/_authenticated/wellbeing")({
  head: () => ({
    meta: [
      { title: "Student well-being check-ins — Meraki Education" },
      {
        name: "description",
        content:
          "Daily emotional check-ins let students tell teachers how they are feeling, with research-based strategies to help them succeed.",
      },
      { property: "og:title", content: "Student well-being check-ins — Meraki Education" },
      {
        property: "og:description",
        content:
          "Students share how they feel each day; teachers see trends and follow up with the right support.",
      },
    ],
  }),
  component: WellbeingPage,
});

const MOODS = [
  { value: 5, label: "Great", emoji: "😃" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 3, label: "Okay", emoji: "😐" },
  { value: 2, label: "Struggling", emoji: "😕" },
  { value: 1, label: "Rough day", emoji: "😢" },
];

const STRATEGIES: Record<number, string> = {
  5: "Channel the energy: offer a stretch task or peer-tutoring role.",
  4: "Keep momentum with clear goals and specific praise.",
  3: "Check in privately mid-lesson and confirm the student understands the task.",
  2: "Reduce cognitive load: chunk the work, offer a quiet space, follow up with the guardian.",
  1: "Prioritise connection before content — a brief 1:1 conversation and a counsellor referral if it repeats.",
};

function WellbeingPage() {
  const { isStaff } = useAuth();
  const { studentIds } = useTeacherScope();
  const queryClient = useQueryClient();
  const [mood, setMood] = useState("3");
  const [note, setNote] = useState("");
  const [studentId, setStudentId] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [sortMode, setSortMode] = useStudentSort("wellbeing-students");

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCheckins = [] } = useQuery({
    queryKey: ["checkins", filterDate],
    queryFn: async () => {
      let q = supabase
        .from("checkins")
        .select("id, student_id, mood, note, date, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (filterDate) q = q.eq("date", filterDate);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Working as a teacher shows only the check-ins of their own students.
  const students = sortStudents(
    studentIds ? allStudents.filter((s) => studentIds.has(s.id)) : allStudents,
    sortMode,
  );
  const checkins = studentIds
    ? allCheckins.filter((c) => studentIds.has(c.student_id))
    : allCheckins;


  const { data: staffNotes = [] } = useQuery({
    queryKey: ["checkin-staff-notes"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_staff_notes")
        .select("checkin_id, note");
      if (error) throw error;
      return data;
    },
  });

  const staffNoteFor = (checkinId: string) =>
    staffNotes.find((n) => n.checkin_id === checkinId)?.note ?? "";

  const target = isStaff ? studentId : (students[0]?.id ?? "");

  const submit = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Select a student first");
      const { error } = await supabase.from("checkins").insert({
        student_id: target,
        mood: Number(mood),
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      toast.success("Check-in saved");
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const addStaffNote = useMutation({
    mutationFn: async (input: { id: string; value: string }) => {
      const value = input.value.trim();
      if (!value) {
        const { error } = await supabase
          .from("checkin_staff_notes")
          .delete()
          .eq("checkin_id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("checkin_staff_notes")
        .upsert({ checkin_id: input.id, note: value }, { onConflict: "checkin_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      queryClient.invalidateQueries({ queryKey: ["checkin-staff-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameFor = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}` : "Student";
  };

  const average =
    checkins.length > 0
      ? checkins.reduce((sum, c) => sum + Number(c.mood), 0) / checkins.length
      : null;

  return (
    <AppShell
      title={isStaff ? "Well-being" : "How I'm doing"}
      description={
        isStaff
          ? "Emotional check-ins with research-based follow-up strategies."
          : "Check in on how you're feeling and get strategies that can help."
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel h-fit p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <HeartPulse className="size-4 text-accent" /> New check-in
          </h2>
          {isStaff && (
            <div className="mt-3">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.last_name}, {s.first_name} · Gr {s.grade_level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2">
                <StudentSortControl value={sortMode} onChange={setSortMode} className="w-full" />
              </div>
            </div>
          )}
          <div className="mt-3">
            <Label>How is the day going?</Label>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMood(String(m.value))}
                  className={
                    "rounded-md border px-2 py-3 text-center text-xs transition-colors " +
                    (mood === String(m.value)
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-secondary/60")
                  }
                >
                  <span className="block text-lg">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="note">Anything to share? (optional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <Button className="mt-4 w-full" onClick={() => submit.mutate()} disabled={submit.isPending}>
            Save check-in
          </Button>
          <p className="mt-3 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
            {STRATEGIES[Number(mood)]}
          </p>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {filterDate ? `Check-ins on ${formatDate(filterDate)}` : "Recent check-ins"}
            </h2>
            {average != null ? (
              <p className="text-xs text-muted-foreground">
                Average mood {average.toFixed(1)} / 5 across {checkins.length} check-ins
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-44 space-y-1.5">
              <Label htmlFor="checkin-date">View a specific date</Label>
              <Input
                id="checkin-date"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
            {filterDate && (
              <Button size="sm" variant="ghost" onClick={() => setFilterDate("")}>
                Show all dates
              </Button>
            )}
          </div>
          {checkins.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No check-ins recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {checkins.map((c) => {
                const mood = MOODS.find((m) => m.value === Number(c.mood));
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-lg">{mood?.emoji ?? "😐"}</span>
                      <p className="text-sm font-medium">{nameFor(c.student_id)}</p>
                      <span className="text-xs text-muted-foreground">{formatDate(c.date)}</span>
                      <span className="text-xs text-muted-foreground">{mood?.label}</span>
                    </div>
                    {editingId === c.id ? (
                      <div className="mt-2 space-y-2 rounded-md border border-border p-3">
                        <div className="grid grid-cols-5 gap-2">
                          {MOODS.map((m) => (
                            <button
                              key={m.value}
                              onClick={() => setEditMood(String(m.value))}
                              className={
                                "rounded-md border px-2 py-2 text-center text-xs transition-colors " +
                                (editMood === String(m.value)
                                  ? "border-accent bg-accent/10"
                                  : "border-border hover:bg-secondary/60")
                              }
                            >
                              <span className="block text-base">{m.emoji}</span>
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          rows={3}
                          placeholder="Comment (optional)"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateCheckin.isPending}
                            onClick={() =>
                              updateCheckin.mutate({
                                id: c.id,
                                mood: Number(editMood),
                                note: editNote,
                              })
                            }
                          >
                            Save changes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : c.note ? (
                      <p className="mt-1 text-sm text-muted-foreground">{c.note}</p>
                    ) : null}
                    {isStaff ? (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {editingId === c.id ? null : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditMood(String(c.mood));
                                  setEditNote(c.note ?? "");
                                }}
                              >
                                Edit check-in
                              </Button>
                              <ConfirmDeleteButton
                                label="Delete"
                                title="Delete this check-in?"
                                description="The check-in and any staff follow-up note will be removed."
                                onConfirm={() => deleteCheckin.mutate(c.id)}
                              />
                            </>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Suggested: {STRATEGIES[Number(c.mood)]}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const value = window.prompt("Follow-up note", staffNoteFor(c.id));
                              if (value != null) addStaffNote.mutate({ id: c.id, value });
                            }}
                          >
                            {staffNoteFor(c.id) ? "Edit follow-up" : "Add follow-up"}
                          </Button>
                        </div>
                        {staffNoteFor(c.id) ? (
                          <p className="mt-1 rounded-md bg-secondary/60 p-2 text-xs">
                            Staff-only follow-up: {staffNoteFor(c.id)}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
