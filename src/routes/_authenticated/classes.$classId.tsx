import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
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
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";
import { AssessmentsTab } from "@/components/class/AssessmentsTab";
import { AssignmentWork } from "@/components/class/AssignmentWork";
import { GradingSetupTab } from "@/components/class/GradingSetup";
import { SharedLibrary } from "@/components/class/SharedLibrary";
import { RubricsTab, RubricSelect } from "@/components/class/RubricsTab";
import { DiscussionBoard } from "@/components/class/DiscussionBoard";
import { PulseDashboard } from "@/components/class/PulseDashboard";
import { StudentClassReport } from "@/components/class/StudentClassReport";

import { ShareResourceButton } from "@/components/class/ShareResourceButton";
import { CopyToClassesButton } from "@/components/class/CopyToClassesButton";
import { StudentImport } from "@/components/students/StudentImport";
import { ClassLogins } from "@/components/students/ClassLogins";

import { formatDate } from "@/lib/school";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { classTimeZone } from "@/lib/coursework-window";
import {
  REOPEN_DEFAULTS,
  ReopenOptions,
  type ReopenSettings,
} from "@/components/class/ReopenOptions";
import { reopenCoursework } from "@/lib/coursework-reopen.functions";
import { useServerFn } from "@tanstack/react-start";

import {
  computeAverage,
  findMark,
  isExtraCredit,
  markCodeFromComment,
  parseGradingSetup,
  EXTRA_CREDIT_CATEGORY,
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
  const [gradebookSort] = useStudentSort(`class-gradebook-${classId}`);
  const [gradebookCategory, setGradebookCategory] = useState("all");
  const [gradebookDueFrom, setGradebookDueFrom] = useState("");
  const [gradebookDueTo, setGradebookDueTo] = useState("");
  const [gradebookAssignmentSort, setGradebookAssignmentSort] = useState<
    "title" | "category" | "due_date" | "average"
  >("due_date");
  const [gradebookSortDirection, setGradebookSortDirection] = useState<"asc" | "desc">(
    "asc",
  );

  const { data: klass } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term, weights, grade_level, timezone")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const setup = parseGradingSetup(klass?.weights);
  // All start/end times are shown in the class's own time zone.
  const timeZone = classTimeZone(klass?.timezone);
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
      return (data ?? []).filter((r) => r.students);
    },
  });
  const gradebookRoster = sortStudents(roster, gradebookSort, (row) => row.students);

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id, title, category, points_possible, due_date, description, submission_mode, rubric_id, created_at",
        )
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const assignmentIds = assignments.map((a) => a.id);
  const gradebookCategoryCounts = useMemo(
    () =>
      assignments.reduce<Record<string, number>>((counts, assignment) => {
        counts[assignment.category] = (counts[assignment.category] ?? 0) + 1;
        return counts;
      }, {}),
    [assignments],
  );
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

  const gradebookRows = useMemo(() => {
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true,
    });
    const rows = assignments
      .filter(
        (assignment) =>
          gradebookCategory === "all" || assignment.category === gradebookCategory,
      )
      .filter((assignment) => !gradebookDueFrom || (assignment.due_date ?? "") >= gradebookDueFrom)
      .filter((assignment) => !gradebookDueTo || (assignment.due_date ?? "") <= gradebookDueTo)
      .map((assignment) => {
        const possible = Number(assignment.points_possible);
        const countedScores = grades
          .filter((grade) => grade.assignment_id === assignment.id)
          .flatMap((grade) => {
            const mark = findMark(markCodeFromComment(grade.comment), setup.marks);
            if (mark?.behavior === "exclude") return [];
            if (mark?.behavior === "zero") return [0];
            if (mark?.behavior === "value") return [Number(mark.value ?? 0)];
            if (grade.points_earned == null || possible <= 0) return [];
            return [(Number(grade.points_earned) / possible) * 100];
          });
        const average =
          countedScores.length > 0
            ? countedScores.reduce((sum, percentage) => sum + percentage, 0) /
              countedScores.length
            : null;
        return { assignment, average, scoredCount: countedScores.length };
      });

    rows.sort((left, right) => {
      let result = 0;
      if (gradebookAssignmentSort === "title") {
        result = collator.compare(left.assignment.title.trim(), right.assignment.title.trim());
      } else if (gradebookAssignmentSort === "category") {
        result = collator.compare(
          left.assignment.category.trim(),
          right.assignment.category.trim(),
        );
      } else if (gradebookAssignmentSort === "average") {
        if (left.average == null && right.average == null) result = 0;
        else if (left.average == null) result = 1;
        else if (right.average == null) result = -1;
        else result = left.average - right.average;
      } else {
        if (!left.assignment.due_date && !right.assignment.due_date) result = 0;
        else if (!left.assignment.due_date) result = 1;
        else if (!right.assignment.due_date) result = -1;
        else result = left.assignment.due_date.localeCompare(right.assignment.due_date);
      }
      if (result === 0) {
        result = collator.compare(left.assignment.title.trim(), right.assignment.title.trim());
      }
      return gradebookSortDirection === "asc" ? result : -result;
    });
    return rows;
  }, [
    assignments,
    grades,
    gradebookAssignmentSort,
    gradebookCategory,
    gradebookDueFrom,
    gradebookDueTo,
    gradebookSortDirection,
  ]);

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
          {isStaff && <TabsTrigger value="rubrics">Rubrics</TabsTrigger>}
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
            roster={gradebookRoster}
            assignments={assignments}
            grades={grades}
            setup={setup}
            isStaff={isStaff}
            useIds={useIds}
            studentAverage={studentAverage}
          />
          <section className="coursework-ledger mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)]">
            {roster.length === 0 || assignments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {isStaff
                  ? "Add students to the roster and create assignments to see the gradebook."
                  : "Your teacher will add assignments and scores here."}
              </p>
            ) : (
              <div>
                <header className="border-b border-border bg-card/95 p-4 backdrop-blur">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Assignment overview</h2>
                      <p className="text-sm text-muted-foreground">
                        {gradebookRows.length} of {assignments.length} assignments
                      </p>
                    </div>
                    <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-5">
                      <div className="space-y-1">
                        <Label htmlFor="gradebook-category" className="text-xs">Category</Label>
                        <Select value={gradebookCategory} onValueChange={setGradebookCategory}>
                          <SelectTrigger id="gradebook-category" aria-label="Filter assignments by category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All categories ({assignments.length})</SelectItem>
                            {Object.entries(gradebookCategoryCounts)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([category, count]) => (
                                <SelectItem key={category} value={category}>
                                  {category} ({count})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gradebook-due-from" className="text-xs">Due from</Label>
                        <Input id="gradebook-due-from" type="date" value={gradebookDueFrom} onChange={(event) => setGradebookDueFrom(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gradebook-due-to" className="text-xs">Due through</Label>
                        <Input id="gradebook-due-to" type="date" value={gradebookDueTo} onChange={(event) => setGradebookDueTo(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gradebook-sort" className="text-xs">Sort by</Label>
                        <Select value={gradebookAssignmentSort} onValueChange={(value) => setGradebookAssignmentSort(value as typeof gradebookAssignmentSort)}>
                          <SelectTrigger id="gradebook-sort" aria-label="Sort assignments">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="due_date">Due date</SelectItem>
                            <SelectItem value="title">Assignment name</SelectItem>
                            <SelectItem value="category">Category</SelectItem>
                            <SelectItem value="average">Class average</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gradebook-direction" className="text-xs">Direction</Label>
                        <Select value={gradebookSortDirection} onValueChange={(value) => setGradebookSortDirection(value as "asc" | "desc")}>
                          <SelectTrigger id="gradebook-direction" aria-label="Sort direction">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">Ascending</SelectItem>
                            <SelectItem value="desc">Descending</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </header>

                {gradebookRows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No assignments match these filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] text-sm">
                      <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Assignment name</th>
                          <th className="px-4 py-3 font-semibold">Category</th>
                          <th className="px-4 py-3 font-semibold">Due date</th>
                          <th className="px-4 py-3 text-right font-semibold">Class average</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradebookRows.map(({ assignment, average, scoredCount }, rowIndex) => (
                          <tr key={assignment.id} className={rowIndex % 2 === 0 ? "bg-card" : "bg-secondary/20"}>
                            <td className="border-t border-border px-4 py-4 font-semibold text-foreground">
                              {assignment.title}
                            </td>
                            <td className="border-t border-border px-4 py-4">
                              <Badge variant="secondary">{assignment.category}</Badge>
                            </td>
                            <td className="border-t border-border px-4 py-4 text-muted-foreground">
                              {assignment.due_date ? formatDate(assignment.due_date) : "No due date"}
                            </td>
                            <td className="border-t border-border px-4 py-4 text-right">
                              {average == null ? (
                                <span className="text-muted-foreground">Not graded</span>
                              ) : (
                                <div>
                                  <span className="text-base font-semibold tabular-nums text-foreground">
                                    {average.toFixed(1)}%
                                  </span>
                                  <p className="text-xs text-muted-foreground">
                                    {scoredCount} {scoredCount === 1 ? "score" : "scores"}
                                  </p>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="coursework">
          <AssignmentsTab
            classId={classId}
            isStaff={isStaff}
            assignments={assignments}
            grades={grades}
            roster={gradebookRoster}
            categories={assignmentCategories}
            gradeLevel={klass?.grade_level ?? null}
            subject={klass?.subject ?? null}
            timeZone={timeZone}
          />
          <AssessmentsTab
            classId={classId}
            isStaff={isStaff}
            assignments={assignments}
            categories={assignmentCategories}
            gradeLevel={klass?.grade_level ?? null}
            timeZone={timeZone}
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
          <TabsContent value="rubrics" className="mt-4">
            <RubricsTab
              classId={classId}
              gradeLevel={klass?.grade_level ?? null}
              subject={klass?.subject ?? null}
            />
          </TabsContent>
        )}

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
            assignments={assignments}
            grades={grades}
            setup={setup}
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
  rubric_id: string | null;
  created_at?: string | null;
};

function AssignmentsTab({
  classId,
  isStaff,
  assignments,
  grades,
  roster,
  categories,
  gradeLevel,
  subject,
  timeZone,
}: {
  classId: string;
  isStaff: boolean;
  assignments: AssignmentRow[];
  grades: Array<{
    assignment_id: string;
    student_id: string;
    points_earned: number | null;
  }>;
  roster: RosterRow[];
  categories: string[];
  gradeLevel?: number | null;
  subject?: string | null;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const draftKey = `new-assignment:${classId}`;
  const blank = {
    title: "",
    category: categories[0] ?? "Homework",
    points: "100",
    due: "",
    description: "",
    mode: "collected",
    rubricId: "",
  };
  const [form, setForm] = useState(() => readDraft<typeof blank>(draftKey) ?? blank);
  const [applyToSubject, setApplyToSubject] = useState(false);
  const formDirty = form.title.trim().length > 0 || form.description.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, form, { dirty: formDirty });

  // Other classes this teacher runs for the same subject, so one piece of work
  // can be handed to every one of them at once.
  const { data: siblingClasses = [] } = useQuery({
    queryKey: ["sibling-subject-classes", classId, subject],
    enabled: isStaff && open && !!subject,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [] as { id: string; name: string }[];
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, teacher_id")
        .eq("teacher_id", uid)
        .eq("subject", subject!)
        .neq("id", classId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
    },
  });

  const students = roster
    .map((r) => r.students)
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }));

  const categoryCounts = useMemo(
    () =>
      assignments.reduce<Record<string, number>>((counts, assignment) => {
        counts[assignment.category] = (counts[assignment.category] ?? 0) + 1;
        return counts;
      }, {}),
    [assignments],
  );

  const visibleAssignments = useMemo(() => {
    const needle = assignmentSearch.trim().toLocaleLowerCase();
    return assignments
      .filter((assignment) => categoryFilter === "all" || assignment.category === categoryFilter)
      .filter(
        (assignment) =>
          !needle ||
          assignment.title.toLocaleLowerCase().includes(needle) ||
          assignment.category.toLocaleLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return a.title.localeCompare(b.title);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return b.due_date.localeCompare(a.due_date) || a.title.localeCompare(b.title);
      });
  }, [assignmentSearch, assignments, categoryFilter]);

  const create = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Assignment title is required");
      const points = Number(form.points);
      if (Number.isNaN(points) || points <= 0 || points > 10000)
        throw new Error("Points possible must be between 1 and 10000");
      const targets = [
        classId,
        ...(applyToSubject ? siblingClasses.map((c) => c.id) : []),
      ];
      const base = {
        title: form.title.trim().slice(0, 140),
        category: form.category,
        points_possible: points,
        due_date: form.due || null,
        description: form.description.trim().slice(0, 1000) || null,
        submission_mode: form.mode,
      };

      const { error } = await supabase.from("assignments").insert(
        targets.map((cid) => ({
          ...base,
          class_id: cid,
          // A rubric belongs to one class, so only the original class keeps it.
          rubric_id: cid === classId ? form.rubricId || null : null,
        })),
      );
      if (error) throw error;
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(
        count > 1 ? `Assignment added to ${count} classes` : "Assignment added",
      );
      setOpen(false);
      setForm(blank);
      setApplyToSubject(false);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
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
                  {isExtraCredit(form.category) ? (
                    <p className="text-xs text-muted-foreground">
                      Bonus work — points earned lift the average and never count against it.
                    </p>
                  ) : null}
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
                    <SelectItem value="other">Other (scored by you, no hand-in)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Online work opens for students to type a response or attach a file. Collected work
                  is checked in by you, then scored. Other covers anything else — participation,
                  presentations, projects — and is simply scored by you.
                </p>
              </div>
              <RubricSelect
                classId={classId}
                value={form.rubricId}
                onChange={(v) => setForm({ ...form, rubricId: v })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="description">Instructions</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              {siblingClasses.length > 0 ? (
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="apply-subject"
                      checked={applyToSubject}
                      onCheckedChange={(v) => setApplyToSubject(v === true)}
                    />
                    <Label htmlFor="apply-subject" className="text-sm font-normal">
                      Also add this to my other {subject} classes
                      <span className="block text-xs text-muted-foreground">
                        {siblingClasses.map((c) => c.name).join(", ")} — each class gets its own
                        copy to score separately.
                      </span>
                    </Label>
                  </div>
                </div>
              ) : null}
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

      <section className="coursework-ledger mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)]">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <div className="grid min-h-[28rem] lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="hidden border-r border-border bg-secondary/35 p-3 lg:block">
              <p className="px-2 pb-2 text-xs font-semibold uppercase text-muted-foreground">
                Categories
              </p>
              <div className="space-y-1">
                <Button
                  type="button"
                  variant={categoryFilter === "all" ? "default" : "ghost"}
                  className="w-full justify-between"
                  onClick={() => setCategoryFilter("all")}
                >
                  <span>All coursework</span>
                  <span className="text-xs opacity-70">{assignments.length}</span>
                </Button>
                {Object.entries(categoryCounts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, count]) => (
                    <Button
                      key={category}
                      type="button"
                      variant={categoryFilter === category ? "default" : "ghost"}
                      className="w-full justify-between"
                      onClick={() => setCategoryFilter(category)}
                    >
                      <span className="truncate">{category}</span>
                      <span className="text-xs opacity-70">{count}</span>
                    </Button>
                  ))}
              </div>
            </aside>

            <div className="min-w-0">
              <header className="sticky top-0 z-10 border-b border-border bg-card/95 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Course assignments</h2>
                    <p className="text-xs text-muted-foreground">
                      {visibleAssignments.length} of {assignments.length} shown · newest due dates first
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={assignmentSearch}
                      onChange={(event) => setAssignmentSearch(event.target.value)}
                      placeholder="Find an assignment"
                      aria-label="Find an assignment"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="mt-3 lg:hidden">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger aria-label="Filter assignments by category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All coursework ({assignments.length})</SelectItem>
                      {Object.entries(categoryCounts)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([category, count]) => (
                          <SelectItem key={category} value={category}>
                            {category} ({count})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </header>

              <div className="max-h-[70vh] space-y-2 overflow-y-auto bg-secondary/15 p-3 sm:p-4">
                {visibleAssignments.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No assignments match this search.
                  </p>
                ) : (
                  visibleAssignments.map((a) => {
                    const scoredCount = grades.filter(
                      (grade) => grade.assignment_id === a.id && grade.points_earned != null,
                    ).length;
                    const fullyScored = roster.length > 0 && scoredCount === roster.length;
                    const progressTone = fullyScored
                      ? "bg-success"
                      : scoredCount > 0
                        ? "bg-coursework-gold"
                        : "bg-coursework-teal";
                    return (
                      <article
                        key={a.id}
                        className="group relative rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] hover:border-coursework-teal hover:shadow-[var(--shadow-panel)]"
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-4 left-0 w-1 rounded-r ${progressTone}`}
                        />
                        <div className="flex flex-col gap-3 pl-2 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant={isExtraCredit(a.category) ? "outline" : "secondary"}>
                                {isExtraCredit(a.category) ? "★ Extra credit" : a.category}
                              </Badge>
                              <span>Due {formatDate(a.due_date)}</span>
                              <span>·</span>
                              <span>{a.points_possible} points</span>
                            </div>
                            <h3 className="text-base font-semibold text-foreground">{a.title}</h3>
                            {a.description ? (
                              <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">
                                {a.description}
                              </p>
                            ) : null}
                            <div className="mt-2">
                              <AssignmentStandards assignmentId={a.id} isStaff={isStaff} />

                              <AssignmentWork
                                assignment={a}
                                classId={classId}
                                isStaff={isStaff}
                                roster={students}
                                timeZone={timeZone}
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-72 xl:justify-end">
                            {isStaff ? (
                              <Badge variant={fullyScored ? "default" : "outline"}>
                                {scoredCount}/{roster.length} scored
                              </Badge>
                            ) : null}
                            {isStaff && (
                              <>
                                <EditAssignment assignment={a} classId={classId} categories={categories} timeZone={timeZone} />
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
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function EditAssignment({
  assignment,
  classId,
  categories,
  timeZone,
}: {
  assignment: AssignmentRow;
  classId: string;
  categories: string[];
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const initial = () => ({
    title: assignment.title,
    category: assignment.category,
    points: String(assignment.points_possible),
    due: assignment.due_date ?? "",
    description: assignment.description ?? "",
    mode: assignment.submission_mode,
    rubricId: assignment.rubric_id ?? "",
  });
  const [form, setForm] = useState(initial);
  const [reopen, setReopen] = useState<ReopenSettings>(REOPEN_DEFAULTS);
  const reopenWork = useServerFn(reopenCoursework);

  function openChange(next: boolean) {
    if (next) {
      setForm(initial());
      setReopen(REOPEN_DEFAULTS);
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
          rubric_id: form.rubricId || null,
        })
        .eq("id", assignment.id);
      if (error) throw error;

      // Pushing the due date later automatically gives students another chance.
      const wasDue = assignment.due_date ?? "";
      const movedLater = Boolean(form.due) && (!wasDue || form.due > wasDue);
      if (movedLater) {
        return reopenWork({
          data: { assignmentId: assignment.id, scope: reopen.scope, notify: reopen.notify },
        });
      }
      return null;
    },
    onSuccess: (result) => {
      toast.success(
        result && result.reopened > 0
          ? `Assignment updated — reopened for ${result.reopened} student${result.reopened === 1 ? "" : "s"}`
          : "Assignment updated",
      );
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      queryClient.invalidateQueries({ queryKey: ["grades", classId] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-grades", assignment.id] });
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
          <ReopenOptions
            idPrefix={`e-reopen-${assignment.id}`}
            value={reopen}
            onChange={setReopen}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`e-mode-${assignment.id}`}>How is this handed in?</Label>
            <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
              <SelectTrigger id={`e-mode-${assignment.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Completed online in the site</SelectItem>
                <SelectItem value="collected">Collected in class (e.g. notebooks)</SelectItem>
                <SelectItem value="other">Other (scored by you, no hand-in)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <RubricSelect
            classId={classId}
            value={form.rubricId}
            onChange={(v) => setForm({ ...form, rubricId: v })}
          />
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
  assignments,
  grades,
  setup,
}: {
  classId: string;
  isStaff: boolean;
  roster: RosterRow[];
  useIds: boolean;
  className?: string | undefined;
  gradeLevel?: number | null | undefined;
  assignments: {
    id: string;
    title: string;
    category: string;
    points_possible: number;
    due_date: string | null;
  }[];
  grades: {
    assignment_id: string;
    student_id: string;
    points_earned: number | null;
    comment: string | null;
  }[];
  setup: ReturnType<typeof parseGradingSetup>;
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
  const [sortMode, setSortMode] = useStudentSort(`class-roster-${classId}`);
  const [reportStudentId, setReportStudentId] = useState<string | null>(null);

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
  const available = sortStudents(students.filter((s) => !enrolledIds.has(s.id)), sortMode);

  const [groupBy, setGroupBy] = useState<"none" | "grade" | "homeroom">("none");

  const sortedRoster = sortStudents(roster, sortMode, (row) => row.students);

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
  const reportStudent = roster.find((row) => row.student_id === reportStudentId)?.students ?? null;

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
          <StudentSortControl value={sortMode} onChange={setSortMode} />
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
                 {isStaff && r.students ? (
                   <Button
                     type="button"
                     variant="link"
                     className="h-auto p-0 font-semibold"
                     onClick={() => setReportStudentId(r.student_id)}
                   >
                     {studentLabel(r.students, useIds)}
                   </Button>
                 ) : (
                   studentLabel(r.students, useIds)
                 )}
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
      <StudentClassReport
        open={!!reportStudentId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReportStudentId(null);
        }}
        classId={classId}
        className={className ?? "Class"}
        student={reportStudent}
        assignments={assignments}
        grades={grades}
        setup={setup}
        displayName={studentLabel(reportStudent, useIds)}
      />
    </div>
  );
}
