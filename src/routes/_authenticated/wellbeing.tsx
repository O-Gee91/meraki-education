import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { listWellbeingFeed } from "@/lib/wellbeing.functions";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const { isStaff, user } = useAuth();
  const { gradeLevels, teacherMode } = useTeacherScope();
  const queryClient = useQueryClient();
  const fetchWellbeingFeed = useServerFn(listWellbeingFeed);
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

  // Working as a teacher shows every student in a grade they teach, so the
  // whole grade-level team can respond when support is needed. Classes without
  // a grade level still show their own roster, so nobody sees an empty page.
  const { studentIds } = useTeacherScope();
  const scoped = !!gradeLevels || !!studentIds;
  const students = sortStudents(
    scoped
      ? allStudents.filter(
          (s) =>
            (!!gradeLevels && s.grade_level != null && gradeLevels.has(s.grade_level)) ||
            (!!studentIds && studentIds.has(s.id)),
        )
      : allStudents,
    sortMode,
  );
  const {
    data: checkins = [],
    isLoading: checkinsLoading,
    isError: checkinsFailed,
    refetch: retryCheckins,
  } = useQuery({
    queryKey: ["checkins", "wellbeing-feed", filterDate, teacherMode],
    queryFn: () => fetchWellbeingFeed({
      data: filterDate ? { date: filterDate, teacherMode } : { teacherMode },
    }),
    retry: false,
  });

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
      if (!user) throw new Error("Please sign in again");
      const value = input.value.trim();
      if (!value) {
        const { error } = await supabase
          .from("checkin_staff_notes")
          .delete()
          .eq("checkin_id", input.id)
          .eq("created_by", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("checkin_staff_notes")
        .upsert(
          { checkin_id: input.id, note: value, created_by: user.id },
          { onConflict: "checkin_id,created_by" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const average =
    checkins.length > 0
      ? checkins.reduce((sum, c) => sum + Number(c.mood), 0) / checkins.length
      : null;

  return (
    <AppShell
      desktopReview
      title={isStaff ? "Well-being" : "How I'm doing"}
      description={
        isStaff
          ? "Emotional check-ins with research-based follow-up strategies."
          : "Check in on how you're feeling and get strategies that can help."
      }
    >
      <div className="grid min-w-0 gap-8 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="min-w-0 self-start border-b border-border pb-6 xl:border-b-0 xl:border-r xl:pr-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartPulse className="size-4 text-accent" /> New check-in
          </h2>
          {isStaff && (
            <div className="mt-4">
              <Label htmlFor="checkin-student">Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger id="checkin-student">
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
          <div className="mt-4">
            <Label id="checkin-mood-label">How is the day going?</Label>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-labelledby="checkin-mood-label">
              {MOODS.map((m) => (
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={mood === String(m.value)}
                  aria-label={m.label}
                  key={m.value}
                  onClick={() => setMood(String(m.value))}
                  className={
                    "h-10 min-w-0 justify-start gap-2 px-3 text-sm shadow-none " +
                    (m.value === 1 ? "col-span-2 " : "") +
                    (mood === String(m.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent hover:bg-secondary/60")
                  }
                >
                  <span aria-hidden="true" className="text-lg">{m.emoji}</span>
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="note">Anything to share? (optional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <Button className="mt-4 w-full" onClick={() => submit.mutate()} disabled={submit.isPending}>
            Save check-in
          </Button>
          <details className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Suggested support</summary>
            <p className="mt-2 leading-relaxed">{STRATEGIES[Number(mood)]}</p>
          </details>
        </section>

        <section className="min-w-0 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {filterDate ? `Check-ins on ${formatDate(filterDate)}` : "Recent check-ins"}
              </h2>
              {average != null && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Average mood {average.toFixed(1)} / 5 across {checkins.length} check-ins
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40 space-y-1">
                <Label htmlFor="checkin-date" className="text-xs text-muted-foreground">View date</Label>
                <Input
                  id="checkin-date"
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>
              {filterDate && (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setFilterDate("")}>
                  Show all
                </Button>
              )}
            </div>
          </div>

          {checkinsLoading ? (
            <p className="mt-6 text-sm text-muted-foreground text-center">Loading check-ins…</p>
          ) : checkinsFailed ? (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-center">
              <p className="text-sm text-foreground font-medium">We couldn’t load the Well-being updates.</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => retryCheckins()}>
                Try again
              </Button>
            </div>
          ) : checkins.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground text-center">No check-ins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {checkins.map((c) => {
                const mood = MOODS.find((m) => m.value === Number(c.mood));
                const responses = c.responses;
                const myResponse = responses.find((r) => r.createdBy && r.createdBy === user?.id);
                return (
                  <li key={c.id} className="min-w-0 space-y-3 py-5">
                    <div className="flex items-start gap-3">
                      <span aria-hidden="true" className="shrink-0 text-xl">{mood?.emoji ?? "😐"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{c.studentName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.date)} · {mood?.label}</p>
                      </div>
                    </div>
                    {c.note && (
                      <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground">{c.note}</p>
                    )}
                    
                    {isStaff && (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <details className="min-w-0 flex-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Suggested support</summary>
                          <p className="mt-2 max-w-prose leading-relaxed">{STRATEGIES[Number(c.mood)]}</p>
                        </details>
                        <Button
                                  variant="ghost"
                          className="h-auto shrink-0 px-2 py-1 text-xs"
                          onClick={() => {
                            const value = window.prompt(
                              "Your response to this student",
                              myResponse?.note ?? "",
                            );
                            if (value != null) addStaffNote.mutate({ id: c.id, value });
                          }}
                        >
                         {myResponse ? "Edit response" : "Add response"}
                        </Button>
                      </div>
                    )}
                    
                    {responses.length > 0 && (
                      <div className="space-y-4 border-l-2 border-border pl-4">
                        {responses.map((r) => (
                          <div
                            key={r.id}
                            className="min-w-0 max-w-prose"
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-foreground">
                                Teacher response{r.createdBy === user?.id ? " (you)" : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(r.createdAt)}
                              </p>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{r.note}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Responded by {r.responderName}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
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
