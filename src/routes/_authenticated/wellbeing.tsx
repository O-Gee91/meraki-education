import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HeartPulse, Lock } from "lucide-react";
import { NotebookEmpty, NotebookLoading, NotebookMood } from "@/components/NotebookDecorations";
import { LoadError } from "@/components/LoadError";
import { Sketch } from "@/components/Sketch";
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
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { PREVIEW_READ_ONLY } from "@/hooks/useStudentPreview";
import { useTeacherScope } from "@/hooks/useTeacherScope";

import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";
import { type WellbeingFeedItem } from "@/lib/wellbeing.functions";
import { useWellbeingFeed } from "@/hooks/useWellbeingFeed";
import { followUpReason, LOW_MOOD, moodTrendLabel, shiftDate } from "@/lib/wellbeing-patterns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// Research-based teacher strategies (relationship-first, cognitive load, private check-ins).
const STRATEGIES: Record<number, string> = {
  5: "Channel the energy: offer a stretch task or peer-tutoring role.",
  4: "Keep momentum with clear goals and specific praise.",
  3: "Check in privately mid-lesson and confirm the student understands the task.",
  2: "Reduce cognitive load: chunk the work, offer a quiet space, follow up with the guardian.",
  1: "Prioritise connection before content — a brief 1:1 conversation and a counsellor referral if it repeats.",
};

// Gentle, student-facing ideas. Never clinical.
const STUDENT_IDEAS: Record<number, string> = {
  5: "Love that! Maybe share some of that energy by helping a classmate today.",
  4: "Nice. Keep it going — pick one small goal for today.",
  3: "Okay days are normal. A short stretch or a glass of water can help reset.",
  2: "Thanks for being honest. Try three slow breaths, and it's okay to ask a teacher for a quick chat.",
  1: "We're glad you told us. A teacher will see this — you can also talk to any adult you trust at school.",
};

const STARTERS = [
  "Thanks for sharing how you're feeling.",
  "Want to have a quick chat after class?",
  "I'm here if you need anything today.",
];

type Filter = "all" | "followup" | "note" | "awaiting";

function WellbeingPage() {
  const { isStaff } = useAuth();
  return (
    <AppShell
      desktopReview
      title={isStaff ? "Well-being" : "How I'm doing"}
      description={
        isStaff
          ? "A calm summary of check-ins with suggested next steps."
          : "A quick, private check-in. Only you and your teachers can see it."
      }
    >
      {isStaff ? <StaffView /> : <StudentView />}
    </AppShell>
  );
}

function useFeed(filterDate: string) {
  return useWellbeingFeed(filterDate);
}

function MoodPicker({ mood, setMood }: { mood: number | null; setMood: (n: number) => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="How are you feeling?">
      {MOODS.map((m) => (
        <Button
          variant="ghost"
          type="button"
          role="radio"
          aria-checked={mood === m.value}
          key={m.value}
          onClick={() => setMood(m.value)}
          className={
            "notebook-mood-choice h-auto flex flex-col items-center gap-1 rounded-md border px-1 py-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring " +
            (mood === m.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-secondary/60")
          }
        >
          <NotebookMood value={m.value} emoji={m.emoji} />
          {m.label}
          {mood === m.value && <Sketch seed={`selected-mood:${m.value}`} tone="blue" />}
        </Button>
      ))}
    </div>
  );
}

function StudentView() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const { previewingStudent } = useAuth();
  const { students } = useSelfStudents();
  const { data: feed = [], isLoading, isError, refetch } = useFeed("");
  // Only the viewer's own check-ins, even for staff previewing as a student.
  const ownIds = new Set(students.map((s) => s.id));
  const checkins = feed.filter((c) => ownIds.has(c.studentId));
  const todays = checkins.find((c) => c.date === today);
  const target = students[0]?.id ?? "";

  const submit = useMutation({
    mutationFn: async () => {
      if (previewingStudent) throw new Error(PREVIEW_READ_ONLY);
      if (!target) throw new Error("We couldn't find your student record.");
      if (mood == null) throw new Error("Pick how you're feeling first");
      const { error } = await supabase
        .from("checkins")
        .insert({ student_id: target, mood, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      setEditing(false);
      toast.success("Thanks for checking in today");
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showForm = !todays || editing;
  const shownMood = todays && !editing ? todays.mood : mood;

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="min-w-0 self-start border-b border-border pb-6 xl:border-b-0 xl:border-r xl:pr-6">
        <h2 className="notebook-heading flex items-center gap-2 text-lg font-semibold">
          <HeartPulse className="size-4 text-accent" /> Today's check-in
        </h2>
        {showForm ? (
          <>
            <Label className="mt-4 block">How are you feeling right now?</Label>
            <MoodPicker mood={mood} setMood={setMood} />
            <Label htmlFor="note" className="mt-4 block">Anything you'd like to share? (optional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" /> Private — only you and your teachers see this.
            </p>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => submit.mutate()} disabled={submit.isPending || mood == null}>
                Check in
              </Button>
              {editing && (
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
            <p className="text-sm">
              <span aria-hidden="true" className="mr-2 text-xl">{MOODS.find((m) => m.value === todays!.mood)?.emoji}</span>
              You checked in as <strong>{MOODS.find((m) => m.value === todays!.mood)?.label}</strong>.
            </p>
            <Button variant="ghost" size="sm" className="mt-2 h-auto px-0 text-xs" onClick={() => setEditing(true)}>
              Feeling different? Check in again
            </Button>
          </div>
        )}
        {shownMood != null && (
          <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
            {STUDENT_IDEAS[shownMood]}
          </p>
        )}
      </section>

      <section className="min-w-0 [overflow-wrap:anywhere]">
        <h2 className="notebook-heading border-b border-border pb-4 text-lg font-semibold">My recent check-ins</h2>
        {isLoading ? (
          <NotebookLoading className="mt-6 justify-center text-sm text-muted-foreground">Loading your check-ins…</NotebookLoading>
        ) : isError ? (
          <div className="mt-6 text-center">
            <p className="text-sm">We couldn't load your check-ins.</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : checkins.length === 0 ? (
          <NotebookEmpty className="mt-6 justify-center text-sm text-muted-foreground">Your check-ins will appear here.</NotebookEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {checkins.slice(0, 30).map((c) => {
              const m = MOODS.find((x) => x.value === c.mood);
              return (
                <li key={c.id} className="space-y-3 py-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-xl">{m?.emoji}</span>
                    <p className="text-sm"><span className="font-medium">{m?.label}</span> <span className="text-muted-foreground">· {formatDate(c.date)}</span></p>
                  </div>
                  {c.note && <p className="max-w-prose whitespace-pre-wrap text-sm">{c.note}</p>}
                  {c.responses.map((r) => (
                    <div key={r.id} className="max-w-prose border-l-2 border-primary/40 pl-4">
                      <p className="text-xs font-semibold">Note from {r.responderName}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{r.note}</p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StaffView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [responding, setResponding] = useState<WellbeingFeedItem | null>(null);
  const [responseText, setResponseText] = useState("");
  const { data: checkins = [], isLoading, isError, refetch } = useFeed(filterDate);

  const { reasons, todayCount, studentsSeen, weekAvg } = useMemo(() => {
    const byStudent = new Map<string, WellbeingFeedItem[]>();
    for (const c of checkins) {
      const list = byStudent.get(c.studentId) ?? [];
      list.push(c);
      byStudent.set(c.studentId, list);
    }
    const reasons = new Map<string, string>();
    for (const [id, list] of byStudent) {
      const r = followUpReason(list, today);
      if (r) reasons.set(id, r);
    }
    const since = shiftDate(today, -6);
    const week = checkins.filter((c) => c.date >= since);
    return {
      reasons,
      todayCount: new Set(checkins.filter((c) => c.date === today).map((c) => c.studentId)).size,
      studentsSeen: byStudent.size,
      weekAvg: week.length ? week.reduce((s, c) => s + c.mood, 0) / week.length : null,
    };
  }, [checkins, today]);

  const visible = checkins.filter((c) => {
    if (search && !c.studentName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "followup") return reasons.has(c.studentId) && c.mood <= LOW_MOOD;
    if (filter === "note") return !!c.note;
    if (filter === "awaiting") return (!!c.note || c.mood <= LOW_MOOD) && c.responses.length === 0;
    return true;
  });

  const saveResponse = useMutation({
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
        .upsert({ checkin_id: input.id, note: value, created_by: user.id }, { onConflict: "checkin_id,created_by" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Response saved");
      setResponding(null);
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openResponse = (c: WellbeingFeedItem) => {
    const mine = c.responses.find((r) => r.createdBy === user?.id);
    setResponseText(mine?.note ?? "");
    setResponding(c);
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All check-ins" },
    { key: "followup", label: "Follow-up suggested" },
    { key: "note", label: "Has a note" },
    { key: "awaiting", label: "Awaiting response" },
  ];

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <section aria-label="Check-in summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Checked in today" value={`${todayCount}`} detail={`of ${studentsSeen} students with recent check-ins`} />
        <SummaryCard label="This week" value={moodTrendLabel(weekAvg)} detail={weekAvg != null ? `Average ${weekAvg.toFixed(1)} / 5` : "—"} />
        <button
          type="button"
          onClick={() => setFilter("followup")}
          className="rounded-md border border-border p-4 text-left hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <p className="text-xs text-muted-foreground">May appreciate a quick check-in</p>
          <p className="mt-1 text-lg font-semibold">{reasons.size} student{reasons.size === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Based on repeated low check-ins</p>
        </button>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter check-ins">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant="outline"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={"h-8 shadow-none " + (filter === f.key ? "border-primary bg-primary/10 text-primary" : "")}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input aria-label="Search student" placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-44" />
          <Input aria-label="View date" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="h-9 w-40" />
          {filterDate && <Button size="sm" variant="ghost" onClick={() => setFilterDate("")}>Show all</Button>}
          <Button size="sm" variant="secondary" onClick={() => setAssistOpen(true)}>Record a check-in</Button>
        </div>
      </div>

      {isLoading ? (
        <NotebookLoading className="justify-center text-sm text-muted-foreground">Loading check-ins…</NotebookLoading>
      ) : isError ? (
        <div className="text-center">
          <p className="text-sm font-medium">We couldn't load the well-being updates.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : visible.length === 0 ? (
        <NotebookEmpty className="justify-center text-sm text-muted-foreground">
          {filter === "all" ? "No check-ins recorded yet." : "Nothing here right now."}
        </NotebookEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((c) => {
            const m = MOODS.find((x) => x.value === c.mood);
            const mine = c.responses.find((r) => r.createdBy === user?.id);
            const reason = c.mood <= LOW_MOOD ? reasons.get(c.studentId) : undefined;
            return (
              <li key={c.id} className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="text-xl">{m?.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold">{c.studentName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(c.date)} · {m?.label}
                        {reason && <> · <span className="text-foreground">{reason}</span></>}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => openResponse(c)}>
                    {mine ? "Edit response" : "Respond"}
                  </Button>
                </div>
                {c.note && <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{c.note}</p>}
                <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium">Suggested next step:</span> {STRATEGIES[c.mood]}
                </p>
                {c.responses.length > 0 && (
                  <div className="space-y-3 border-l-2 border-border pl-4">
                    {c.responses.map((r) => (
                      <div key={r.id} className="max-w-prose">
                        <p className="text-xs text-muted-foreground">
                          {r.responderName}{r.createdBy === user?.id ? " (you)" : ""} · {formatDate(r.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{r.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!responding} onOpenChange={(o) => !o && setResponding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Respond to {responding?.studentName}</DialogTitle>
            <DialogDescription>The student will see your note with their check-in.</DialogDescription>
          </DialogHeader>
          {responding && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Suggested:</span> {STRATEGIES[responding.mood]}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button key={s} type="button" size="sm" variant="outline" className="h-auto py-1 text-xs shadow-none"
                onClick={() => setResponseText((t) => (t ? `${t} ${s}` : s))}>
                {s}
              </Button>
            ))}
          </div>
          <Textarea aria-label="Your response" rows={4} value={responseText} onChange={(e) => setResponseText(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResponding(null)}>Cancel</Button>
            <Button disabled={saveResponse.isPending}
              onClick={() => responding && saveResponse.mutate({ id: responding.id, value: responseText })}>
              Save response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssistedCheckin open={assistOpen} onOpenChange={setAssistOpen} />
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function AssistedCheckin({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { studentIds, scopeError, teacherMode, scoped: scopeReady } = useTeacherScope();
  const [sortMode, setSortMode] = useStudentSort("wellbeing-students");
  const [studentId, setStudentId] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
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
  const scopeLoading = teacherMode && !scopeReady && !scopeError;
  const students = scopeError || scopeLoading
    ? []
    : sortStudents(
        studentIds ? allStudents.filter((s) => studentIds.has(s.id)) : allStudents,
        sortMode,
      );
  const submit = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error("Select a student first");
      if (mood == null) throw new Error("Pick a mood");
      const { error } = await supabase
        .from("checkins")
        .insert({ student_id: studentId, mood, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Check-in saved");
      setNote("");
      setMood(null);
      setStudentId("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a check-in</DialogTitle>
          <DialogDescription>For a student who checked in with you in person.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="checkin-student">Student</Label>
        {scopeError ? (
          <LoadError label="Students couldn't be loaded, so this check-in stays closed." />
        ) : scopeLoading ? (
          <NotebookLoading className="text-sm text-muted-foreground">Loading students…</NotebookLoading>
        ) : null}
        <Select value={studentId} onValueChange={setStudentId} disabled={scopeError || scopeLoading}>
          <SelectTrigger id="checkin-student"><SelectValue placeholder="Select a student" /></SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.last_name}, {s.first_name} · Gr {s.grade_level}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <StudentSortControl value={sortMode} onChange={setSortMode} className="w-full" />
        <MoodPicker mood={mood} setMood={setMood} />
        <Textarea aria-label="Note (optional)" placeholder="Note (optional)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Save check-in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
