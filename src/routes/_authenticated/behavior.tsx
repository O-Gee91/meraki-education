import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePagedLimit } from "@/lib/paged";
import { ShowOlder } from "@/components/ShowOlder";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadError } from "@/components/LoadError";
import { NotebookEmpty, NotebookLoading } from "@/components/NotebookDecorations";
import { useAuth } from "@/hooks/useAuth";
import { useSelfStudents } from "@/hooks/useSelfStudents";
import { useTeacherScope } from "@/hooks/useTeacherScope";
import { fetchCoTaughtClassIds } from "@/hooks/useCoTaughtClasses";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
import { fetchAll } from "@/lib/query";


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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { classId?: string } =>
    typeof search["classId"] === "string" ? { classId: search["classId"] } : {},
  component: BehaviorPage,
});


function BehaviorPage() {
  const { isStaff, primaryRole } = useAuth();
  const { classId } = Route.useSearch();
  const isStudent = primaryRole === "student";

  return (
    <AppShell
      desktopReview
      title={isStudent ? "My behavior" : "Behavior & strikes"}
      description={
        isStudent
          ? "Shout-outs you have earned, notes your teachers have logged, and any strikes or detention scheduled for you."
          : "Shared with every teacher of the grade — recognition, concerns and a three-strike system that schedules detention automatically."
      }
    >
      <Tabs defaultValue="log">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pb-3">
          <TabsTrigger value="log">{isStudent ? "My log" : "Behavior log"}</TabsTrigger>
          <TabsTrigger value="strikes">{isStudent ? "My strikes" : "Strike tracker"}</TabsTrigger>
          <TabsTrigger value="detentions">{isStudent ? "My detentions" : "Detentions"}</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <BehaviorLog isStaff={isStaff} initialClassId={classId} />
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

/** In "View as student", only the demo Student Tester's rows (staff RLS sees everyone). */
function usePreviewStudentIds() {
  const { previewingStudent } = useAuth();
  const { ids } = useSelfStudents();
  return previewingStudent ? ids : null;
}

function useNotes(limit: number) {
  const previewIds = usePreviewStudentIds();
  return useQuery({
    queryKey: ["behavior", previewIds, limit],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from("behavior_notes")
        .select(
          "id, kind, reason, assignment_id, scored_zero, notes, date, student_id, class_id, recorded_by, students(first_name, last_name, grade_level), assignments(title), classes(name)",
        );
      if (previewIds) q = q.in("student_id", previewIds);
      const { data, error } = await q

        .order("date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

function BehaviorLog({ isStaff, initialClassId }: { isStaff: boolean; initialClassId?: string | undefined }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({
    studentId: "",
    classId: initialClassId ?? "",
    kind: "positive",
    reason: "",
    assignmentId: "",
    markZero: true,
    note: "",
    date: "",
  });

  const notesPage = usePagedLimit(200);
  const notesQuery = useNotes(notesPage.limit);
  const notes = notesQuery.data ?? [];
  const notesFetching = notesQuery.isFetching;
  const [gradeFilter, setGradeFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [classFilter, setClassFilter] = useState(initialClassId ?? "all");
  const [scope, setScope] = useState<"all" | "classes" | "mine">(
    initialClassId ? "classes" : "all",
  );
  const [search, setSearch] = useState("");
  const [drawerStudent, setDrawerStudent] = useState<string | null>(null);
  const [sortMode, setSortMode] = useStudentSort("behavior-student-picker");

  // Classes this staff member teaches or co-teaches, with their enrollments.
  const { data: myScope } = useQuery({
    queryKey: ["behavior-my-classes", user?.id],
    enabled: isStaff && !!user,
    queryFn: async () => {
      const coTaught = await fetchCoTaughtClassIds(user!.id);
      const { data: classes, error } = await supabase
        .from("classes")
        .select("id, name, teacher_id");
      if (error) throw error;
      const mine = (classes ?? []).filter((c) => c.teacher_id === user!.id || coTaught.has(c.id));
      const ids = mine.map((c) => c.id);
      const { data: enr, error: eErr } = ids.length
        ? await supabase.from("enrollments").select("student_id, class_id").in("class_id", ids)
        : { data: [], error: null };
      if (eErr) throw eErr;
      return { classes: mine.sort((a, b) => a.name.localeCompare(b.name)), enrollments: enr ?? [] };
    },
  });
  const myClasses = myScope?.classes ?? [];
  const myClassIds = useMemo(() => new Set(myClasses.map((c) => c.id)), [myClasses]);
  const myStudentIds = useMemo(
    () => new Set((myScope?.enrollments ?? []).map((e) => e.student_id)),
    [myScope],
  );
  const classStudents = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of myScope?.enrollments ?? []) {
      if (!map.has(e.class_id)) map.set(e.class_id, new Set());
      map.get(e.class_id)!.add(e.student_id);
    }
    return map;
  }, [myScope]);

  // Class filter options: my classes plus any class appearing on a note.
  const classOptions = useMemo(() => {
    const map = new Map<string, string>(myClasses.map((c) => [c.id, c.name]));
    for (const n of notes) if (n.class_id && n.classes?.name) map.set(n.class_id, n.classes.name);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [myClasses, notes]);

  const recorderIds = useMemo(
    () => [...new Set(notes.map((n) => n.recorded_by).filter((v): v is string => !!v))].sort(),
    [notes],
  );
  const { data: recorderNames = new Map<string, string>() } = useQuery({
    queryKey: ["behavior-recorders", recorderIds],
    enabled: isStaff && recorderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", recorderIds);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.full_name]));
    },
  });

  const grades = useMemo(
    () =>
      [...new Set(notes.map((n) => n.students?.grade_level).filter((g): g is number => !!g))].sort(
        (a, b) => a - b,
      ),
    [notes],
  );
  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (gradeFilter !== "all" && String(n.students?.grade_level ?? "") !== gradeFilter) return false;
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (scope === "mine" && n.recorded_by !== user?.id) return false;
      if (
        scope === "classes" &&
        !(myStudentIds.has(n.student_id) || (n.class_id && myClassIds.has(n.class_id)))
      )
        return false;
      if (classFilter !== "all") {
        const inClass =
          n.class_id === classFilter ||
          (!n.class_id && classStudents.get(classFilter)?.has(n.student_id));
        if (!inClass) return false;
      }
      if (q) {
        const name = `${n.students?.first_name ?? ""} ${n.students?.last_name ?? ""}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [notes, gradeFilter, kindFilter, scope, classFilter, search, user?.id, myStudentIds, myClassIds, classStudents]);

  const { studentIds, scopeError } = useTeacherScope();
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
  // Teacher mode limits logging to students this person actually teaches;
  // a chosen class narrows the picker to that roster.
  const formRoster = form.classId ? classStudents.get(form.classId) : undefined;
  const students = sortStudents(
    scopeError
      ? []
      : allStudents.filter(
          (s) => (!studentIds || studentIds.has(s.id)) && (!formRoster || formRoster.has(s.id)),
        ),
    sortMode,
  );
  const formClassOptions = myClasses.filter(
    (c) => !form.studentId || classStudents.get(c.id)?.has(form.studentId),
  );


  // Assignments the flagged student is enrolled in — used for a plagiarism zero.
  const { data: studentAssignments = [] } = useQuery({
    queryKey: ["behavior-student-assignments", form.studentId],
    enabled: isStaff && !!form.studentId,
    queryFn: async () => {
      const { data: enrolled, error: enrollError } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("student_id", form.studentId);
      if (enrollError) throw enrollError;
      const classIds = (enrolled ?? []).map((row) => row.class_id);
      if (!classIds.length) return [];
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, due_date, points_possible, classes(name)")
        .in("class_id", classIds)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reasonOptions = reasonsFor(form.kind);
  const needsAssignment = form.kind === "strike" && form.reason === "plagiarism";

  const create = useMutation({
    mutationFn: async () => {
      if (!form.studentId) throw new Error("Pick a student");
      if (reasonOptions.length && !form.reason) throw new Error("Pick a reason");
      if (form.note.trim().length < 4) throw new Error("Add a short note");
      if (needsAssignment && form.markZero && !form.assignmentId) {
        throw new Error("Pick the assignment to mark zero");
      }
      const zeroed = Boolean(needsAssignment && form.markZero && form.assignmentId);
      const { error } = await supabase.from("behavior_notes").insert({
        student_id: form.studentId,
        class_id: form.classId || null,
        recorded_by: user?.id ?? null,
        kind: form.kind,
        reason: form.reason || null,
        assignment_id: needsAssignment && form.assignmentId ? form.assignmentId : null,
        scored_zero: zeroed,
        notes: form.note.trim().slice(0, 1000),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      if (zeroed) {
        // Same upsert shape the gradebook uses, so the 0 shows everywhere.
        const { error: gradeError } = await supabase.from("grades").upsert(
          {
            assignment_id: form.assignmentId,
            student_id: form.studentId,
            points_earned: 0,
            comment: "Plagiarism — scored zero",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
        if (gradeError) throw gradeError;
      }
      return form.kind;
    },
    onSuccess: (kind) => {
      toast.success(
        kind === "strike"
          ? "Strike logged — every third strike schedules detention and notifies the family"
          : "Note logged",
      );
      setForm({
        studentId: "",
        classId: form.classId,
        kind: form.kind,
        reason: "",
        assignmentId: "",
        markZero: true,
        note: "",
        date: "",
      });
      queryClient.invalidateQueries({ queryKey: ["behavior"] });
      queryClient.invalidateQueries({ queryKey: ["detentions"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className={`mt-6 grid min-w-0 gap-8 ${isStaff ? "xl:grid-cols-[20rem_minmax(0,1fr)]" : ""}`}>
      {isStaff && (
        <section className="min-w-0 self-start border-b border-border pb-6 xl:border-b-0 xl:border-r xl:pr-6">
          <h2 className="text-lg font-semibold">Log a note</h2>
          {scopeError ? <LoadError label="Your class list couldn't be loaded, so students stay hidden." /> : null}
          <div className="mt-4 space-y-4">
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
            {formClassOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="note-class">Class (optional)</Label>
                <Select
                  value={form.classId || "none"}
                  onValueChange={(v) => setForm({ ...form, classId: v === "none" ? "" : v })}
                >
                  <SelectTrigger id="note-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not class-specific</SelectItem>
                    {formClassOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="kind">Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) =>
                  setForm({ ...form, kind: v, reason: "", assignmentId: "" })
                }
              >
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k === "strike" ? "Strike (counts toward detention)" : kindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reasonOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="reason">
                  {form.kind === "strike" ? "Reason" : "Concern type"}
                </Label>
                <Select
                  value={form.reason}
                  onValueChange={(v) => setForm({ ...form, reason: v, assignmentId: "" })}
                >
                  <SelectTrigger id="reason">
                    <SelectValue placeholder="Choose a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.reason === "other" ? (
                  <p className="text-xs text-muted-foreground">
                    Describe what happened in the note below.
                  </p>
                ) : null}
              </div>
            )}
            {needsAssignment && (
              <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                <Label htmlFor="plagiarism-assignment">Affected assignment</Label>
                <Select
                  value={form.assignmentId}
                  onValueChange={(v) => setForm({ ...form, assignmentId: v })}
                >
                  <SelectTrigger id="plagiarism-assignment">
                    <SelectValue
                      placeholder={
                        form.studentId ? "Choose an assignment" : "Pick a student first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {studentAssignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}
                        {a.classes?.name ? ` · ${a.classes.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.markZero}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, markZero: checked === true })
                    }
                  />
                  Mark this assignment zero in the gradebook
                </label>
              </div>
            )}

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
                guardian, their teachers and school leadership.
              </p>
            ) : null}
          </div>
        </section>
      )}

      <section className="min-w-0 divide-y divide-border">
        <div className="space-y-3 pb-4">
          <h2 className="text-lg font-semibold">{isStaff ? "Grade-wide behavior log" : "Behavior log"}</h2>
          {isStaff && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Log scope">
              {(
                [
                  ["all", "All grade-wide"],
                  ["classes", "My classes"],
                  ["mine", "Logged by me"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={scope === value ? "secondary" : "ghost"}
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isStaff && (
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search student…"
                  aria-label="Search student"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Filters
                  {(classFilter !== "all" ? 1 : 0) + (gradeFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                      {(classFilter !== "all" ? 1 : 0) + (gradeFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0)}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-3">
            {isStaff && classOptions.length > 0 && (
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-full" aria-label="Filter by class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-full" aria-label="Filter by grade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {grades.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-full" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {NOTE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {kindLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
                {(classFilter !== "all" ? 1 : 0) + (gradeFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => { setClassFilter("all"); setGradeFilter("all"); setKindFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-xs text-muted-foreground">
            {notesQuery.isError ? "Notes couldn't be loaded." : notesQuery.isPending ? "Loading notes…" : `Showing ${visibleNotes.length} of ${notes.length} notes`}
          </p>
        </div>
        {notesQuery.isError ? (
          <LoadError label="Behavior notes couldn't be loaded." onRetry={() => void notesQuery.refetch()} />
        ) : notesQuery.isPending ? (
          <NotebookLoading className="p-6 text-sm text-muted-foreground">Loading behavior notes…</NotebookLoading>
        ) : visibleNotes.length === 0 ? (
          <NotebookEmpty className="p-6 text-sm text-muted-foreground">No behavior notes match these filters.</NotebookEmpty>
        ) : (
          visibleNotes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              isStaff={isStaff}
              currentUserId={user?.id}
              recorderName={n.recorded_by ? recorderNames.get(n.recorded_by) : undefined}
              onOpenStudent={isStaff ? setDrawerStudent : undefined}
            />
          ))
        )}
        <ShowOlder show={notesPage.hasMore(notes.length)} loading={notesFetching} onClick={notesPage.showMore} label="Load older notes" />
      </section>
      <StudentHistorySheet
        studentId={drawerStudent}
        notes={notes}
        recorderNames={recorderNames}
        currentUserId={user?.id}
        onClose={() => setDrawerStudent(null)}
      />
    </div>
  );
}

function StudentHistorySheet({
  studentId,
  notes,
  recorderNames,
  currentUserId,
  onClose,
}: {
  studentId: string | null;
  notes: NoteRecord[];
  recorderNames: Map<string, string>;
  currentUserId?: string | undefined;
  onClose: () => void;
}) {
  const history = studentId ? notes.filter((n) => n.student_id === studentId) : [];
  const student = history[0]?.students;
  const strikes = history.filter((n) => n.kind === "strike").length;
  const inCycle = strikes % 3;
  const positives = history.filter((n) => n.kind === "positive").length;
  const { data: detentions = [] } = useQuery({
    queryKey: ["detentions", "student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detentions")
        .select("id, reason, scheduled_date, status")
        .eq("student_id", studentId!)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Sheet open={!!studentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {student ? `${student.last_name}, ${student.first_name}` : "Student"}
          </SheetTitle>
          <SheetDescription>
            {student?.grade_level ? `Grade ${student.grade_level} · ` : ""}Full behavior history
          </SheetDescription>
        </SheetHeader>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Strikes in cycle</dt>
            <dd className="text-lg font-semibold">{inCycle}/3</dd>
          </div>
          <div className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Total strikes</dt>
            <dd className="text-lg font-semibold">{strikes}</dd>
          </div>
          <div className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">Shout-outs</dt>
            <dd className="text-lg font-semibold">{positives}</dd>
          </div>
        </dl>
        <h3 className="mt-6 text-sm font-semibold">Detentions</h3>
        {detentions.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None scheduled.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {detentions.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span>{formatDate(d.scheduled_date)}</span>
                <span className="text-muted-foreground">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-6 text-sm font-semibold">Notes</h3>
        <ul className="mt-2 divide-y divide-border">
          {history.map((n) => (
            <li key={n.id} className="py-3 text-sm">
              <p className="font-medium">{noteHeadline(n)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(n.date)}
                {n.classes?.name ? ` · ${n.classes.name}` : ""}
                {n.recorded_by === currentUserId && currentUserId
                  ? " · Logged by you"
                  : n.recorded_by && recorderNames.get(n.recorded_by)
                    ? ` · Logged by ${recorderNames.get(n.recorded_by)}`
                    : ""}
              </p>
              {n.notes ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.notes}</p> : null}
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

type NoteRecord = {
  id: string;
  kind: string;
  reason?: string | null;
  assignment_id?: string | null;
  scored_zero?: boolean | null;
  notes: string | null;
  date: string;
  student_id: string;
  class_id?: string | null;
  recorded_by?: string | null;
  students: { first_name: string; last_name: string; grade_level?: number | null } | null;
  assignments?: { title: string } | null;
  classes?: { name: string } | null;
};

/** e.g. "Strike — Plagiarism — Essay 2 (0)" */
function noteHeadline(note: NoteRecord) {
  const parts = [kindLabel(note.kind)];
  const reason = reasonLabel(note.kind, note.reason);
  if (reason) parts.push(reason);
  if (note.assignments?.title) {
    parts.push(`${note.assignments.title}${note.scored_zero ? " (0)" : ""}`);
  }
  return parts.join(" — ");
}

function NoteRow({
  note,
  isStaff,
  currentUserId,
  recorderName,
  onOpenStudent,
}: {
  note: NoteRecord;
  isStaff: boolean;
  currentUserId?: string | undefined;
  recorderName?: string | undefined;
  onOpenStudent?: ((studentId: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    kind: note.kind,
    reason: note.reason ?? "",
    date: note.date,
    notes: note.notes ?? "",
  });
  const draftReasons = reasonsFor(draft.kind);


  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["behavior"] });
    queryClient.invalidateQueries({ queryKey: ["detentions"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (draft.notes.trim().length < 4) throw new Error("Add a short note");
      if (draftReasons.length && !draft.reason) throw new Error("Pick a reason");
      const { error } = await supabase
        .from("behavior_notes")
        .update({
          kind: draft.kind,
          reason: draft.reason || null,
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
      <article className="space-y-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            value={draft.kind}
            onValueChange={(kind) => setDraft({ ...draft, kind, reason: "" })}
          >
            <SelectTrigger aria-label="Edit note type" className="min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draftReasons.length > 0 && (
            <Select value={draft.reason} onValueChange={(reason) => setDraft({ ...draft, reason })}>
              <SelectTrigger aria-label="Edit note reason" className="min-w-0">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {draftReasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="date"
            aria-label="Edit note date"
            className="min-w-0"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </div>

        <Textarea
          aria-label="Edit note text"
          value={draft.notes}
          maxLength={1000}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </article>
    );
  }

  const mine = !!currentUserId && note.recorded_by === currentUserId;
  return (
    <article className={`py-5 ${note.kind === "strike" ? "notebook-strike-slip" : ""} ${mine ? "border-l-2 border-l-primary/50 pl-3" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            className="notebook-data break-words text-left text-sm font-semibold hover:underline"
            onClick={() => onOpenStudent?.(note.student_id)}
            title="See this student's full behavior history"
          >
            {note.students?.last_name}, {note.students?.first_name}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(note.date)}
            {note.students?.grade_level ? ` · Grade ${note.students.grade_level}` : ""}
            {note.classes?.name ? ` · ${note.classes.name}` : ""}
            {mine
              ? " · Logged by you"
              : recorderName
                ? ` · Logged by ${recorderName}`
                : ""}
          </p>
        </div>
        {isStaff && (
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" aria-label="Edit note" title="Edit note" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete note"
              title="Delete note"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <Badge variant="outline" className={`mt-2 max-w-full whitespace-normal break-words border-transparent shadow-none ${note.kind === "strike" ? "bg-destructive/10 text-destructive" : note.kind === "positive" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
        {noteHeadline(note)}
      </Badge>
      {note.kind === "strike" ? <span className="notebook-stamp mt-2" aria-hidden="true">Strike</span> : null}
      <p className={`mt-2 max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground ${note.kind === "strike" ? "notebook-slip-fill" : ""}`}>{note.notes}</p>
    </article>
  );
}


type StrikeRow = {
  studentId: string;
  name: string;
  grade: number | null;
  strikes: number;
  last: string;
  reasons: string[];
};

function StrikeRowItem({ row }: { row: StrikeRow }) {
  const inCycle = row.strikes % 3 === 0 ? 3 : row.strikes % 3;
  return (
    <li className="notebook-strike-slip grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="min-w-0">
        <p className="notebook-data break-words text-sm font-semibold">{row.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.strikes} total · last {formatDate(row.last)}
        </p>
        {row.reasons.length ? <p className="notebook-slip-fill mt-1 max-w-prose break-words text-sm text-muted-foreground">{row.reasons.join(", ")}</p> : null}
      </div>
      <div className="space-y-2 md:justify-self-end">
      <span className="notebook-stamp" aria-hidden="true">Strike</span>
      <span className="flex items-center gap-2">
        <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={
              "h-2 w-5 rounded-sm " + (i <= inCycle ? "bg-destructive/70" : "bg-secondary")
            }
          />
        ))}
        </span>
        <span className="text-xs text-muted-foreground">{inCycle}/3 in cycle</span>
      </span>
      {inCycle === 3 ? (
        <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
          Detention required
        </Badge>
      ) : null}
      </div>
    </li>
  );
}

function StrikeTracker() {
  const notesQuery = useNotes(1000);
  const notes = notesQuery.data ?? [];
  const [gradeFilter, setGradeFilter] = useState("all");

  const rows = useMemo(() => {
    const map = new Map<string, StrikeRow>();
    for (const n of notes) {
      if (n.kind !== "strike") continue;
      const name = `${n.students?.last_name ?? "Student"}, ${n.students?.first_name ?? ""}`;
      const reason = reasonLabel(n.kind, n.reason);
      const current = map.get(n.student_id);
      if (current) {
        current.strikes += 1;
        if (n.date > current.last) current.last = n.date;
        if (reason && !current.reasons.includes(reason)) current.reasons.push(reason);
      } else {
        map.set(n.student_id, {
          studentId: n.student_id,
          name,
          grade: n.students?.grade_level ?? null,
          strikes: 1,
          last: n.date,
          reasons: reason ? [reason] : [],
        });
      }
    }
    return [...map.values()].sort((a, b) => b.strikes - a.strikes);
  }, [notes]);

  const grades = useMemo(
    () =>
      [...new Set(rows.map((r) => r.grade).filter((g): g is number => g != null))].sort(
        (a, b) => a - b,
      ),
    [rows],
  );

  const visibleRows = useMemo(
    () =>
      gradeFilter === "all" ? rows : rows.filter((r) => String(r.grade ?? "none") === gradeFilter),
    [rows, gradeFilter],
  );

  // When no single grade is chosen, group the roster under one heading per grade.
  const groups = useMemo(() => {
    const keys = [...grades.map((g) => String(g))];
    if (visibleRows.some((r) => r.grade == null)) keys.push("none");
    return keys
      .map((key) => ({
        key,
        label: key === "none" ? "No grade set" : `Grade ${key}`,
        items: visibleRows.filter((r) => String(r.grade ?? "none") === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [grades, visibleRows]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold">Three-strike tracker</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Strikes reset in cycles of three — reaching the third strike schedules detention.
          </p>
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-40" aria-label="Filter strikes by grade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All grades</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g} value={String(g)}>
                Grade {g}
              </SelectItem>
            ))}
            {rows.some((r) => r.grade == null) ? (
              <SelectItem value="none">No grade set</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      {notesQuery.isError ? (
        <LoadError label="Strikes couldn't be loaded." onRetry={() => void notesQuery.refetch()} />
      ) : notesQuery.isPending ? (
        <NotebookLoading className="mt-4 text-sm text-muted-foreground">Loading strikes…</NotebookLoading>
      ) : visibleRows.length === 0 ? (
        <NotebookEmpty className="mt-4 text-sm text-muted-foreground">
          {rows.length === 0 ? "No strikes on record." : "No strikes for this grade."}
        </NotebookEmpty>
      ) : gradeFilter === "all" ? (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {group.label}
                </h3>
                <Badge variant="secondary">{group.items.length}</Badge>
              </div>
              <ul className="mt-1 divide-y divide-border">
                {group.items.map((r) => (
                  <StrikeRowItem key={r.studentId} row={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {visibleRows.map((r) => (
            <StrikeRowItem key={r.studentId} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUSES = ["scheduled", "served", "waived"] as const;

function Detentions({ isStaff }: { isStaff: boolean }) {
  const queryClient = useQueryClient();

  const previewIds = usePreviewStudentIds();
  const detentionsQuery = useQuery({
    queryKey: ["detentions", previewIds],
    queryFn: () =>
      fetchAll((from, to) => {
        let page = supabase
          .from("detentions")
          .select(
            "id, reason, strike_count, scheduled_date, status, notes, created_at, students(first_name, last_name, guardian_email, grade_level)",
          );
        if (previewIds) page = page.in("student_id", previewIds);
        return page.order("scheduled_date", { ascending: false }).order("id").range(from, to);
      }),
  });
  const detentions = detentionsQuery.data ?? [];

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

  const [view, setView] = useState<"active" | "completed" | "all">("active");

  if (detentionsQuery.isError) {
    return <LoadError label="Detentions couldn't be loaded." onRetry={() => void detentionsQuery.refetch()} />;
  }
  if (detentionsQuery.isPending) {
    return <NotebookLoading className="mt-6 text-sm text-muted-foreground">Loading detentions…</NotebookLoading>;
  }
  if (detentions.length === 0) {
    return (
      <NotebookEmpty className="mt-6 border-t border-border py-6 text-sm text-muted-foreground">
        No detentions scheduled. They are created automatically when a student reaches three
        strikes.
      </NotebookEmpty>
    );
  }

  const activeCount = detentions.filter((d) => d.status === "scheduled").length;
  const completedCount = detentions.length - activeCount;
  const shown = detentions.filter((d) =>
    view === "all" ? true : view === "active" ? d.status === "scheduled" : d.status !== "scheduled",
  );

  const byGrade = new Map<number, typeof detentions>();
  for (const d of shown) {
    const g = d.students?.grade_level ?? 0;
    byGrade.set(g, [...(byGrade.get(g) ?? []), d]);
  }
  const grades = [...byGrade.keys()].sort((a, b) => a - b);

  const pills = [
    { key: "active", label: `Active to serve (${activeCount})` },
    { key: "completed", label: `Completed & waived (${completedCount})` },
    { key: "all", label: `All (${detentions.length})` },
  ] as const;

  return (
    <div className="mt-6 grid gap-8">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter detentions">
        {pills.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={view === p.key ? "default" : "outline"}
            aria-pressed={view === p.key}
            onClick={() => setView(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <NotebookEmpty className="text-sm text-muted-foreground">
          {view === "active"
            ? "No students currently need to serve detention."
            : "No completed or waived detentions yet."}
        </NotebookEmpty>
      ) : null}
      {grades.map((g) => (
        <section key={g} aria-labelledby={`detention-grade-${g}`}>
          <h3 id={`detention-grade-${g}`} className="text-sm font-semibold">
            {g ? `Grade ${g}` : "No grade"}{" "}
            <span className="font-normal text-muted-foreground">({byGrade.get(g)!.length})</span>
          </h3>
          <div className="mt-2 divide-y divide-border border-t border-border">
          {byGrade.get(g)!.map((d) => (
        <article key={d.id} className="notebook-detention-slip grid min-w-0 gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">
              {d.students?.last_name}, {d.students?.first_name}
            </p>
            <p className="mt-1 max-w-prose break-words text-sm text-muted-foreground">{d.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">Scheduled {formatDate(d.scheduled_date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">{d.strike_count} strikes</Badge>
            {!isStaff ? <Badge variant="outline">{d.status}</Badge> : null}
          </div>
          </div>
          {isStaff ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[10rem_9rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem]">
              <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`detention-date-${d.id}`}>Scheduled date</Label>
              <Input
                id={`detention-date-${d.id}`}
                type="date"
                className="min-w-0"
                defaultValue={d.scheduled_date}
                onChange={(e) =>
                  e.target.value && update.mutate({ id: d.id, patch: { scheduled_date: e.target.value } })
                }
              />
              </div>
              <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`detention-status-${d.id}`}>Status</Label>
              <Select
                value={d.status}
                onValueChange={(status) => update.mutate({ id: d.id, patch: { status } })}
              >
                <SelectTrigger id={`detention-status-${d.id}`} className="min-w-0">
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
              </div>
              <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`detention-reason-${d.id}`}>Reason</Label>
              <Input
                id={`detention-reason-${d.id}`}
                className="min-w-0"
                placeholder="Reason"
                defaultValue={d.reason ?? ""}
                onBlur={(e) => {
                  const reason = e.target.value.trim();
                  if (reason && reason !== d.reason)
                    update.mutate({ id: d.id, patch: { reason } });
                }}
              />
              </div>
              <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`detention-notes-${d.id}`}>Staff notes</Label>
              <Input
                id={`detention-notes-${d.id}`}
                className="min-w-0"
                placeholder="Staff notes"
                defaultValue={d.notes ?? ""}
                onBlur={(e) => {
                  const notes = e.target.value.trim();
                  if (notes !== (d.notes ?? "")) update.mutate({ id: d.id, patch: { notes } });
                }}
              />
              </div>
            </div>
          ) : null}
        </article>
          ))}
          </div>
        </section>
      ))}
    </div>
  );
}
