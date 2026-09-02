import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { MoveStudentsButton } from "@/components/class/MoveStudentsButton";

import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendanceTab } from "@/components/class/AttendanceTab";
import { FileLibrary } from "@/components/files/FileLibrary";

import { studentLabel, useRosterPrivacy } from "@/lib/student-display";
import { AssessmentsTab } from "@/components/class/AssessmentsTab";
import { AssignmentWork } from "@/components/class/AssignmentWork";
import { GradingSetupTab } from "@/components/class/GradingSetup";
import { SharedLibrary } from "@/components/class/SharedLibrary";
import { DiscussionBoard } from "@/components/class/DiscussionBoard";
import { PulseDashboard } from "@/components/class/PulseDashboard";

import { ShareResourceButton } from "@/components/class/ShareResourceButton";
import { CopyToClassesButton } from "@/components/class/CopyToClassesButton";
import { StudentImport } from "@/components/students/StudentImport";
import { ClassLogins } from "@/components/students/ClassLogins";

import { formatDate, gradeTone } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";

import {
  computeAverage,
  findMark,
  letterFor,
  markCodeFromComment,
  parseGradingSetup,
  quickScoreCellValue,
} from "@/lib/grading";


export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class gradebook — Meraki Education" },
      {
        name: "description",
        content: "Gradebook, assignments and roster for a single class section.",
      },
      { property: "og:title", content: "Class gradebook — Meraki Education" },
      {
        property: "og:description",
        content: "Gradebook, assignments and roster for a single class section.",
      },
    ],
  }),
  component: ClassDetailPage,
});

function ClassDetailPage() {
  const { classId } = Route.useParams();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const { useIds, toggle: toggleIds } = useRosterPrivacy();
  const [quickIndex, setQuickIndex] = useState<number | null>(null);

  const { data: klass } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term, weights, grade_level")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const setup = parseGradingSetup(klass?.weights);
  const categoryNames = setup.categories.map((c) => c.name).filter(Boolean);
  // Every class also gets a bonus bucket teachers can use however they like.
  const assignmentCategories = [
    ...(categoryNames.length ? categoryNames : ["Homework"]).filter((c) => !isExtraCredit(c)),
    EXTRA_CREDIT_CATEGORY,
  ];

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, students(id, first_name, last_name, grade_level, student_number)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.students)
        .sort((a, b) =>
          (a.students?.last_name ?? "").localeCompare(b.students?.last_name ?? ""),
        );
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id, title, category, points_possible, due_date, description, submission_mode",
        )
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const assignmentIds = assignments.map((a) => a.id);
  const { data: grades = [] } = useQuery({
    queryKey: ["grades", classId, assignmentIds.length],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, assignment_id, student_id, points_earned, comment")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data;
    },
  });

  const gradeFor = (studentId: string, assignmentId: string) =>
    grades.find((g) => g.student_id === studentId && g.assignment_id === assignmentId);

  const cellValue = (studentId: string, assignmentId: string) => {
    const g = gradeFor(studentId, assignmentId);
    const mark = markCodeFromComment(g?.comment);
    if (mark) return mark;
    return g?.points_earned == null ? "" : String(g.points_earned);
  };

  const saveGrade = useMutation({
    mutationFn: async (input: { studentId: string; assignmentId: string; value: string }) => {
      const raw = input.value.trim();
      const mark = findMark(raw ? raw.toUpperCase() : null, setup.marks);
      let points: number | null = null;
      let comment: string | null = null;

      if (mark) {
        comment = `MARK:${mark.code.toUpperCase()}`;
      } else if (raw !== "") {
        points = Number(raw);
        if (Number.isNaN(points) || points < 0 || points > 10000) {
          throw new Error("Enter a valid score or a special mark code");
        }
      }

      const { error } = await supabase.from("grades").upsert(
        {
          assignment_id: input.assignmentId,
          student_id: input.studentId,
          points_earned: points,
          comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grades", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function studentAverage(studentId: string) {
    return computeAverage(
      assignments.map((a) => {
        const g = gradeFor(studentId, a.id);
        return {
          category: a.category,
          pointsPossible: Number(a.points_possible),
          pointsEarned: g?.points_earned == null ? null : Number(g.points_earned),
          markCode: markCodeFromComment(g?.comment),
        };
      }),
      setup,
    );
  }

  const activeQuick = quickIndex == null ? null : (setup.quickScores[quickIndex] ?? null);

  async function fillColumn(
    assignmentId: string,
    pointsPossible: number,
    onlyBlanks: boolean,
  ) {
    if (!activeQuick) return;
    const value = quickScoreCellValue(activeQuick, pointsPossible);
    const targets = roster.filter((r) => {
      if (!onlyBlanks) return true;
      return cellValue(r.student_id, assignmentId) === "";
    });
    if (targets.length === 0) {
      toast.info("Nothing to fill in that column");
      return;
    }
    for (const r of targets) {
      await saveGrade.mutateAsync({ studentId: r.student_id, assignmentId, value });
    }
    toast.success(`${activeQuick.label} applied to ${targets.length} student(s)`);
  }

  return (
    <AppShell
      title={klass?.name ?? "Class"}
      description={
        klass
          ? isStaff
            ? `${klass.subject ?? "General"} · Period ${klass.period ?? "—"} · Room ${klass.room ?? "—"} · ${klass.term}`
            : `${klass.subject ?? "General"} · Period ${klass.period ?? "—"}`
          : undefined
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {isStaff && (
            <Button variant="outline" size="sm" onClick={toggleIds}>
              {useIds ? "Show names" : "Show student IDs"}
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/classes">All classes</Link>
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="gradebook">
        <TabsList className="flex-wrap">
          <TabsTrigger value="gradebook">{isStaff ? "Gradebook" : "My grades"}</TabsTrigger>
          <TabsTrigger value="coursework">Coursework</TabsTrigger>
          <TabsTrigger value="discussions">Discussion board</TabsTrigger>
          {isStaff && <TabsTrigger value="shared">Shared library</TabsTrigger>}
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          {isStaff && (
            <>
              <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <TabsTrigger value="grading" className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-600">
                Grading setup
              </TabsTrigger>
            </>
          )}
        </TabsList>



        <TabsContent value="gradebook">
          <PulseDashboard
            classId={classId}
            className={klass?.name ?? "this class"}
            roster={roster}
            assignments={assignments}
            grades={grades}
            setup={setup}
            isStaff={isStaff}
            useIds={useIds}
            studentAverage={studentAverage}
          />
          {isStaff && setup.quickScores.length > 0 && (
            <div className="panel mt-4 flex flex-wrap items-center gap-2 p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick scores
              </span>
              {setup.quickScores.map((q, i) => (
                <Button
                  key={`${q.label}-${i}`}
                  size="sm"
                  variant={quickIndex === i ? "default" : "outline"}
                  onClick={() => setQuickIndex(quickIndex === i ? null : i)}
                >
                  {q.label || "(unnamed)"}
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {activeQuick
                  ? "Click a cell's ⚡ to apply, or fill a whole column from its header."
                  : "Pick one to grade with a single click. Edit them in Grading setup."}
              </span>
            </div>
          )}
          <div className="panel mt-4 overflow-x-auto p-0">

            {roster.length === 0 || assignments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {isStaff
                  ? "Add students to the roster and create assignments to see the gradebook."
                  : "Your teacher will add assignments and scores here."}
              </p>
            ) : (
              <table className="w-full min-w-max text-sm">
                <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-secondary/40 px-4 py-3">
                      {isStaff ? "Student" : "Name"}
                    </th>
                    {assignments.map((a) => (
                      <th key={a.id} className="px-3 py-3 font-medium">
                        <div className="max-w-32 truncate" title={a.title}>
                          {a.title}
                        </div>
                        <div className="text-[10px] normal-case text-muted-foreground">
                          {a.category} · {a.points_possible} pts
                        </div>
                        {isStaff && activeQuick && (
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium normal-case text-primary hover:bg-primary/20"
                              onClick={() => fillColumn(a.id, Number(a.points_possible), true)}
                            >
                              Fill blanks
                            </button>
                            <button
                              type="button"
                              className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium normal-case text-foreground hover:bg-secondary/70"
                              onClick={() => fillColumn(a.id, Number(a.points_possible), false)}
                            >
                              Fill all
                            </button>
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3">{isStaff ? "Average" : "My average"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {roster.map((r) => {
                    const avg = studentAverage(r.student_id);
                    return (
                      <tr key={r.id}>
                        <td className="sticky left-0 bg-card px-4 py-2 font-medium">
                          {studentLabel(r.students, useIds)}
                        </td>
                        {assignments.map((a) => {
                          const shown = cellValue(r.student_id, a.id);
                          return (
                            <td key={a.id} className="px-3 py-2">
                              {isStaff ? (
                                <div className="flex items-center gap-1">
                                {activeQuick && (
                                  <button
                                    type="button"
                                    title={`Apply ${activeQuick.label}`}
                                    aria-label={`Apply ${activeQuick.label}`}
                                    className="rounded border border-border px-1 text-xs text-primary hover:bg-primary/10"
                                    onClick={() =>
                                      saveGrade.mutate({
                                        studentId: r.student_id,
                                        assignmentId: a.id,
                                        value: quickScoreCellValue(
                                          activeQuick,
                                          Number(a.points_possible),
                                        ),
                                      })
                                    }
                                  >
                                    ⚡
                                  </button>
                                )}
                                <Input
                                  key={shown}
                                  className="h-8 w-20"
                                  defaultValue={shown}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value.trim() === shown) return;
                                    saveGrade.mutate({
                                      studentId: r.student_id,
                                      assignmentId: a.id,
                                      value,
                                    });
                                  }}
                                />
                                </div>
                              ) : (
                                <span>
                                  {shown === "" ? "—" : shown}
                                  {/^\d/.test(shown) ? `/${a.points_possible}` : ""}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 font-semibold">
                          {avg == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={gradeTone(avg)}>
                              {avg.toFixed(1)}% {letterFor(avg, setup.scale)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="coursework">
          <AssignmentsTab
            classId={classId}
            isStaff={isStaff}
            assignments={assignments}
            roster={roster}
            categories={assignmentCategories}
            gradeLevel={klass?.grade_level ?? null}
          />
          <AssessmentsTab
            classId={classId}
            isStaff={isStaff}
            assignments={assignments}
            gradeLevel={klass?.grade_level ?? null}
          />
        </TabsContent>


        <TabsContent value="grading">
          <GradingSetupTab
            classId={classId}
            isStaff={isStaff}
            setup={setup}
            className={klass?.name ?? "This class"}
          />
        </TabsContent>


        <TabsContent value="discussions">
          <DiscussionBoard
            classId={classId}
            isStaff={isStaff}
            categories={categoryNames.length ? categoryNames : ["Homework"]}
          />
        </TabsContent>

        {isStaff && (
          <TabsContent value="shared">
            <SharedLibrary classId={classId} />
          </TabsContent>
        )}

        <TabsContent value="roster">
          <RosterTab
            classId={classId}
            isStaff={isStaff}
            roster={roster}
            useIds={useIds}
            className={klass?.name}
            gradeLevel={klass?.grade_level ?? null}
          />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab classId={classId} />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <FileLibrary
            classId={classId}
            emptyLabel="No class files yet. Upload handouts, slides, spreadsheets or video."
          />
        </TabsContent>




      </Tabs>

    </AppShell>
  );
}

type AssignmentRow = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
  description: string | null;
  submission_mode: string;
};

function AssignmentsTab({
  classId,
  isStaff,
  assignments,
  roster,
  categories,
  gradeLevel,
}: {
  classId: string;
  isStaff: boolean;
  assignments: AssignmentRow[];
  roster: RosterRow[];
  categories: string[];
  gradeLevel?: number | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const draftKey = `new-assignment:${classId}`;
  const blank = {
    title: "",
    category: categories[0] ?? "Homework",
    points: "100",
    due: "",
    description: "",
    mode: "collected",
  };
  const [form, setForm] = useState(() => readDraft<typeof blank>(draftKey) ?? blank);
  const formDirty = form.title.trim().length > 0 || form.description.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, form, { dirty: formDirty });


  const students = roster
    .map((r) => r.students)
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }));

  const create = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Assignment title is required");
      const points = Number(form.points);
      if (Number.isNaN(points) || points <= 0 || points > 10000)
        throw new Error("Points possible must be between 1 and 10000");
      const { error } = await supabase.from("assignments").insert({
        class_id: classId,
        title: form.title.trim().slice(0, 140),
        category: form.category,
        points_possible: points,
        due_date: form.due || null,
        description: form.description.trim().slice(0, 1000) || null,
        submission_mode: form.mode,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment added");
      setOpen(false);
      setForm(blank);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment deleted");
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      queryClient.invalidateQueries({ queryKey: ["grades", classId] });
      queryClient.invalidateQueries({ queryKey: ["assessments", classId] });
    },
  });

  return (
    <div className="mt-4">
      {isStaff && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New assignment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  maxLength={140}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c: string) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="points">Points possible</Label>
                  <Input
                    id="points"
                    inputMode="numeric"
                    value={form.points}
                    onChange={(e) => setForm({ ...form, points: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due">Due date</Label>
                <Input
                  id="due"
                  type="date"
                  value={form.due}
                  onChange={(e) => setForm({ ...form, due: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mode">How is this handed in?</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Completed online in the site</SelectItem>
                    <SelectItem value="collected">Collected in class (e.g. notebooks)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Online work opens for students to type a response or attach a file. Collected work
                  is checked in by you, then scored.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Instructions</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={formDirty} />
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Add assignment"}
              </Button>
            </DialogFooter>

          </DialogContent>
        </Dialog>
      )}

      <div className="panel mt-4 divide-y divide-border">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{a.title}</p>
                {a.description ? (
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">{a.description}</p>
                ) : null}
                <AssignmentStandards assignmentId={a.id} isStaff={isStaff} />
                <AssignmentWork
                  assignment={a}
                  classId={classId}
                  isStaff={isStaff}
                  roster={students}
                />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{a.category}</Badge>
                <span>{a.points_possible} pts</span>
                <span>Due {formatDate(a.due_date)}</span>
                {isStaff && (
                  <>
                    <EditAssignment assignment={a} classId={classId} categories={categories} />
                    <ShareResourceButton

                      kind="assignment"
                      id={a.id}
                      title={a.title}
                      defaultGrade={gradeLevel ?? null}
                    />
                    <CopyToClassesButton
                      kind="assignment"
                      id={a.id}
                      title={a.title}
                      classId={classId}
                    />

                    <ConfirmDeleteButton
                      title={`Delete "${a.title}"?`}
                      description="This removes the assignment along with its scores, submissions and linked standards."
                      onConfirm={() => removeAssignment.mutate(a.id)}
                      disabled={removeAssignment.isPending}
                    />
                  </>
                )}
              </div>

            </div>
          ))


        )}
      </div>
    </div>
  );
}

function EditAssignment({
  assignment,
  classId,
  categories,
}: {
  assignment: AssignmentRow;
  classId: string;
  categories: string[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: assignment.title,
    category: assignment.category,
    points: String(assignment.points_possible),
    due: assignment.due_date ?? "",
    description: assignment.description ?? "",
    mode: assignment.submission_mode,
  });

  function openChange(next: boolean) {
    if (next) {
      setForm({
        title: assignment.title,
        category: assignment.category,
        points: String(assignment.points_possible),
        due: assignment.due_date ?? "",
        description: assignment.description ?? "",
        mode: assignment.submission_mode,
      });
    }
    setOpen(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Assignment title is required");
      const points = Number(form.points);
      if (Number.isNaN(points) || points <= 0 || points > 10000)
        throw new Error("Points possible must be between 1 and 10000");
      const { error } = await supabase
        .from("assignments")
        .update({
          title: form.title.trim().slice(0, 140),
          category: form.category,
          points_possible: points,
          due_date: form.due || null,
          description: form.description.trim().slice(0, 1000) || null,
          submission_mode: form.mode,
        })
        .eq("id", assignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      queryClient.invalidateQueries({ queryKey: ["grades", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categoryOptions = categories.includes(form.category)
    ? categories
    : [form.category, ...categories];

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`e-title-${assignment.id}`}>Title</Label>
            <Input
              id={`e-title-${assignment.id}`}
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`e-cat-${assignment.id}`}>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id={`e-cat-${assignment.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`e-pts-${assignment.id}`}>Points possible</Label>
              <Input
                id={`e-pts-${assignment.id}`}
                inputMode="numeric"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`e-due-${assignment.id}`}>Due date</Label>
            <Input
              id={`e-due-${assignment.id}`}
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`e-mode-${assignment.id}`}>How is this handed in?</Label>
            <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
              <SelectTrigger id={`e-mode-${assignment.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Completed online in the site</SelectItem>
                <SelectItem value="collected">Collected in class (e.g. notebooks)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`e-desc-${assignment.id}`}>Instructions</Label>
            <Textarea
              id={`e-desc-${assignment.id}`}
              value={form.description}
              maxLength={1000}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentStandards({

  assignmentId,
  isStaff,
}: {
  assignmentId: string;
  isStaff: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: standards = [] } = useQuery({
    queryKey: ["standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standards")
        .select("id, code, description")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["assignment-standards", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_standards")
        .select("id, standard_id")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
  });

  const tag = useMutation({
    mutationFn: async (standardId: string) => {
      const { error } = await supabase
        .from("assignment_standards")
        .insert({ assignment_id: assignmentId, standard_id: standardId });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["assignment-standards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const untag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignment_standards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignment-standards"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const codeFor = (id: string) => standards.find((s) => s.id === id)?.code ?? "standard";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <Badge key={l.id} variant="outline" className="gap-1">
          {codeFor(l.standard_id)}
          {isStaff ? (
            <button onClick={() => untag.mutate(l.id)} className="text-muted-foreground">
              ×
            </button>
          ) : null}
        </Badge>
      ))}
      {isStaff &&
        (adding ? (
          <div className="w-64">
            <Select onValueChange={(v) => tag.mutate(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a standard" />
              </SelectTrigger>
              <SelectContent>
                {standards
                  .filter((s) => !links.some((l) => l.standard_id === s.id))
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-accent hover:underline"
          >
            + tag standard
          </button>
        ))}
    </div>
  );
}



type RosterRow = {
  id: string;
  student_id: string;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: number;
    student_number: string | null;
  } | null;
};

function RosterTab({
  classId,
  isStaff,
  roster,
  useIds,
  className,
  gradeLevel,
}: {
  classId: string;
  isStaff: boolean;
  roster: RosterRow[];
  useIds: boolean;
  className?: string | undefined;
  gradeLevel?: number | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const blankNew = {
    first: "",
    last: "",
    chinese: "",
    grade: gradeLevel ? String(gradeLevel) : "",
    number: "",
    guardianEmail: "",
  };
  const [newForm, setNewForm] = useState(blankNew);
  const [sortBy, setSortBy] = useState<"last" | "first">("last");

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level, student_number")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a student");
      const { error } = await supabase
        .from("enrollments")
        .insert({ class_id: classId, student_id: selected });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added to class");
      setSelected("");
      queryClient.invalidateQueries({ queryKey: ["roster", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Select at least one student");
      const { error } = await supabase.from("enrollments").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(
        count === 1 ? "Removed from class" : `Removed ${count} students from class`
      );
      setPickedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["roster", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePick = (id: string, on: boolean) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const createAndEnroll = useMutation({
    mutationFn: async () => {
      const first = newForm.first.trim();
      const last = newForm.last.trim();
      if (first.length < 2 || last.length < 2) throw new Error("First and last name are required");
      const grade = Number(newForm.grade);
      if (!grade || grade < 1 || grade > 12) throw new Error("Enter a grade level (1–12)");
      const { data, error } = await supabase
        .from("students")
        .insert({
          first_name: first.slice(0, 60),
          last_name: last.slice(0, 60),
          chinese_name: newForm.chinese.trim().slice(0, 60) || null,
          grade_level: grade,
          student_number: newForm.number.trim().slice(0, 40) || null,
          guardian_email: newForm.guardianEmail.trim().toLowerCase().slice(0, 255) || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: enrError } = await supabase
        .from("enrollments")
        .insert({ class_id: classId, student_id: data.id });
      if (enrError) throw enrError;
    },
    onSuccess: () => {
      toast.success("Student created and added to class");
      setNewOpen(false);
      setNewForm(blankNew);
      queryClient.invalidateQueries({ queryKey: ["roster", classId] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enrolledIds = new Set(roster.map((r) => r.student_id));
  const available = students.filter((s) => !enrolledIds.has(s.id));

  const [groupBy, setGroupBy] = useState<"none" | "grade" | "homeroom">("none");

  const sortedRoster = [...roster].sort((a, b) => {
    const aStudent = a.students;
    const bStudent = b.students;
    const aKey = sortBy === "last" ? aStudent?.last_name : aStudent?.first_name;
    const bKey = sortBy === "last" ? bStudent?.last_name : bStudent?.first_name;
    const cmp = (aKey ?? "").localeCompare(bKey ?? "", undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp;
    const aSub = sortBy === "last" ? aStudent?.first_name : aStudent?.last_name;
    const bSub = sortBy === "last" ? bStudent?.first_name : bStudent?.last_name;
    return (aSub ?? "").localeCompare(bSub ?? "", undefined, { sensitivity: "base" });
  });

  const { data: homerooms = {} } = useQuery({
    queryKey: ["roster-homerooms", classId],
    enabled: roster.length > 0,
    queryFn: async () => {
      const ids = roster.map((r) => r.student_id);
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, classes(name, subject, period)")
        .in("student_id", ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const c = row.classes as { name: string; subject: string | null; period: string | null } | null;
        if (!c) continue;
        const hay = `${c.name} ${c.subject ?? ""}`.toLowerCase();
        if (hay.includes("homeroom") || hay.includes("home room")) {
          map[row.student_id] = c.name;
        }
      }
      return map;
    },
  });

  const groups = (() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: sortedRoster }];
    const buckets = new Map<string, RosterRow[]>();
    for (const r of sortedRoster) {
      const key =
        groupBy === "grade"
          ? `Grade ${r.students?.grade_level ?? "—"}`
          : (homerooms[r.student_id] ?? "No homeroom");
      const list = buckets.get(key) ?? [];
      list.push(r);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([label, rows]) => ({ key: label, label, rows }));
  })();

  return (
    <div className="mt-4">
      {isStaff && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="student">Add existing student</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="student">
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No students available
                  </SelectItem>
                ) : (
                  available.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {studentLabel(s, useIds)} (Gr {s.grade_level})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
            Add to class
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">New student</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a new student{className ? ` to ${className}` : ""}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-first">First name</Label>
                    <Input
                      id="ns-first"
                      value={newForm.first}
                      maxLength={60}
                      onChange={(e) => setNewForm({ ...newForm, first: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-last">Last name</Label>
                    <Input
                      id="ns-last"
                      value={newForm.last}
                      maxLength={60}
                      onChange={(e) => setNewForm({ ...newForm, last: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-chinese">Chinese name (optional)</Label>
                    <Input
                      id="ns-chinese"
                      value={newForm.chinese}
                      maxLength={60}
                      onChange={(e) => setNewForm({ ...newForm, chinese: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-guardian">Guardian email (optional)</Label>
                    <Input
                      id="ns-guardian"
                      type="email"
                      value={newForm.guardianEmail}
                      maxLength={255}
                      onChange={(e) => setNewForm({ ...newForm, guardianEmail: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-grade">Grade level</Label>
                    <Input
                      id="ns-grade"
                      type="number"
                      min={1}
                      max={12}
                      value={newForm.grade}
                      onChange={(e) => setNewForm({ ...newForm, grade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-number">Student ID (optional)</Label>
                    <Input
                      id="ns-number"
                      value={newForm.number}
                      maxLength={40}
                      onChange={(e) => setNewForm({ ...newForm, number: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createAndEnroll.mutate()} disabled={createAndEnroll.isPending}>
                  Create and enroll
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <StudentImport
            classId={classId}
            className={className}
            gradeLevel={gradeLevel}
            triggerLabel="Import from Excel"
          />
          <ClassLogins fixedClassId={classId} triggerLabel="Print logins (whole class)" />
        </div>
      )}

      {isStaff && roster.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={pickedIds.size === roster.length && roster.length > 0}
              onCheckedChange={(on) =>
                setPickedIds(on ? new Set(roster.map((r) => r.id)) : new Set())
              }
            />
            Select all ({pickedIds.size} selected)
          </label>
          <MoveStudentsButton
            classId={classId}
            enrollmentIds={[...pickedIds]}
            studentIds={roster.filter((r) => pickedIds.has(r.id)).map((r) => r.student_id)}
            triggerLabel="Add / move to other classes"
            disabled={pickedIds.size === 0}
          />
          <ClassLogins
            fixedClassId={classId}
            studentIds={roster.filter((r) => pickedIds.has(r.id)).map((r) => r.student_id)}
            disabled={pickedIds.size === 0}
            triggerLabel={`Generate / reset logins${pickedIds.size ? ` (${pickedIds.size})` : ""}`}
          />

          <ConfirmDeleteButton
            label="Drop selected"
            title={`Drop ${pickedIds.size} student${pickedIds.size === 1 ? "" : "s"} from this class?`}
            description="They are removed from this roster only. Their grades, submissions and attendance for this class are kept, along with their accounts and other classes."
            disabled={pickedIds.size === 0 || removeMany.isPending}
            onConfirm={() => removeMany.mutate([...pickedIds])}
          />
          <ConfirmDeleteButton
            label="Drop all students"
            title={`Drop all ${roster.length} students from this class?`}
            description="Every student is removed from this roster only. Their grades, submissions and attendance for this class are kept, along with their accounts and other classes."
            disabled={removeMany.isPending}
            onConfirm={() => removeMany.mutate(roster.map((r) => r.id))}
          />
        </div>
      )}


      {roster.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          {(["last", "first"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={sortBy === k ? "default" : "outline"}
              onClick={() => setSortBy(k)}
            >
              {k === "last" ? "Last name" : "First name"}
            </Button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">Group by</span>
          {(["none", "grade", "homeroom"] as const).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={groupBy === g ? "default" : "outline"}
              onClick={() => setGroupBy(g)}
            >
              {g === "none" ? "All students" : g === "grade" ? "Grade" : "Homeroom"}
            </Button>
          ))}
        </div>
      )}

      <div className="panel mt-4 divide-y divide-border">
        {roster.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No students enrolled yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {g.label ? (
                <div className="flex flex-wrap items-center gap-3 bg-secondary/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>
                    {g.label} · {g.rows.length}
                  </span>
                  {isStaff && (
                    <>
                      <label className="flex items-center gap-2 text-xs font-normal normal-case">
                        <Checkbox
                          checked={g.rows.every((r) => pickedIds.has(r.id))}
                          onCheckedChange={(on) =>
                            setPickedIds((prev) => {
                              const next = new Set(prev);
                              for (const r of g.rows) {
                                if (on) next.add(r.id);
                                else next.delete(r.id);
                              }
                              return next;
                            })
                          }
                        />
                        Select group
                      </label>
                      <MoveStudentsButton
                        classId={classId}
                        enrollmentIds={g.rows.map((r) => r.id)}
                        studentIds={g.rows.map((r) => r.student_id)}
                        triggerLabel="Move group"
                      />
                    </>
                  )}
                </div>
              ) : null}
              <div className="divide-y divide-border">
                {g.rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 text-sm">
              <span className="flex items-center gap-3 font-medium">
                {isStaff && (
                  <Checkbox
                    checked={pickedIds.has(r.id)}
                    onCheckedChange={(on) => togglePick(r.id, on === true)}
                    aria-label={`Select ${r.students?.first_name ?? "student"}`}
                  />
                )}
                {studentLabel(r.students, useIds)}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>Grade {r.students?.grade_level}</span>
                {isStaff && (
                  <>
                    <MoveStudentsButton
                      classId={classId}
                      enrollmentIds={[r.id]}
                      studentIds={[r.student_id]}
                      triggerLabel="Add / move"
                    />
                    <ConfirmDeleteButton
                      label="Drop"
                      title="Drop this student from the class?"
                      description="They are removed from this roster only. Their grades, submissions and attendance for this class are kept."
                      disabled={removeMany.isPending}
                      onConfirm={() => removeMany.mutate([r.id])}
                    />
                  </>
                )}

              </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
