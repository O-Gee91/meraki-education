import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, ChevronsUpDown, History, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { StudentPreviewContext } from "@/hooks/useStudentPreview";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { MoveStudentsButton } from "@/components/class/MoveStudentsButton";
import { CoTeachersPanel } from "@/components/class/CoTeachersPanel";
import {
  NotifyChoices,
  PublishNotifyDialog,
  noNotify,
  useNotifyCoursework,
  type NotifyValue,
} from "@/components/class/NotifyChoices";
import { fetchCoTaughtClassIds } from "@/hooks/useCoTaughtClasses";

import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseworkAverages } from "@/components/class/CourseworkAverages";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AttendanceTab } from "@/components/class/AttendanceTab";
import { FileLibrary } from "@/components/files/FileLibrary";

import { studentLabel, useRosterPrivacy } from "@/lib/student-display";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { isTestStudent, sortStudents } from "@/lib/student-sort";
import { TestAccountBadge } from "@/components/students/TestAccountBadge";
import { AssessmentsTab } from "@/components/class/AssessmentsTab";
import { AssignmentWork } from "@/components/class/AssignmentWork";
import { GradingSetupTab } from "@/components/class/GradingSetup";
import { SharedLibrary } from "@/components/class/SharedLibrary";
import { RubricsTab, RubricSelect } from "@/components/class/RubricsTab";
import { DiscussionBoard } from "@/components/class/DiscussionBoard";
import { PulseDashboard } from "@/components/class/PulseDashboard";
import { FeedbackInbox } from "@/components/FeedbackInbox";
import { StudentClassReport } from "@/components/class/StudentClassReport";

import { ShareResourceButton } from "@/components/class/ShareResourceButton";
import { CopyToClassesButton } from "@/components/class/CopyToClassesButton";
import { StudentImport } from "@/components/students/StudentImport";
import { ClassLogins } from "@/components/students/ClassLogins";
import { UnlinkedAccounts } from "@/components/students/UnlinkedAccounts";

import { formatDate } from "@/lib/school";
import { buildDocument, docHeader, escapeHtml, printHtml } from "@/lib/print-doc";
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
  letterFor,
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const { isStaff: realStaff, isAdmin, user, profile } = useAuth();
  const [previewRequested, setPreviewing] = useState(false);
  const queryClient = useQueryClient();
  const { useIds, toggle: toggleIds } = useRosterPrivacy();
  const [gradebookSort, setGradebookSort] = useStudentSort(`class-gradebook-${classId}`);
  const [gradebookSearch, setGradebookSearch] = useState("");
  const [assignmentPage, setAssignmentPage] = useState(0);
  const [gradebookReportStudentId, setGradebookReportStudentId] = useState<string | null>(null);
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

  // Classes this staff member can hop between via the title switcher.
  const { data: switcherClasses = [] } = useQuery({
    queryKey: ["class-switcher", user?.id, profile?.full_name, isAdmin],
    enabled: realStaff && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, period, term, teacher_id, teacher_name")
        .order("name");
      if (error) throw error;
      // Admin mode sees every class; everyone else only their own.
      if (isAdmin) return data ?? [];
      const myName = (profile?.full_name ?? "").trim().toLowerCase();
      const coTaught = await fetchCoTaughtClassIds(user!.id);
      return (data ?? []).filter(
        (c) =>
          c.teacher_id === user!.id ||
          coTaught.has(c.id) ||
          (!!myName && (c.teacher_name ?? "").trim().toLowerCase() === myName),
      );
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

  const { data: fullRoster = [] } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, students(id, first_name, last_name, grade_level, student_number, is_tester)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? []).filter((r) => r.students);
    },
  });
  const testerId = fullRoster.find((r) => isTestStudent(r.students))?.student_id ?? null;
  const previewing = previewRequested && realStaff && !!testerId;
  const isStaff = realStaff && !previewing;
  const roster = previewing ? fullRoster.filter((r) => r.student_id === testerId) : fullRoster;
  // Demo/test accounts stay visible but never count toward class statistics.
  const testerIds = useMemo(
    () => new Set(roster.filter((r) => isTestStudent(r.students)).map((r) => r.student_id)),
    [roster],
  );
  const gradebookRoster = sortStudents(roster, gradebookSort, (row) => row.students);
  const visibleGradebookRoster = gradebookRoster.filter((row) => {
    const query = gradebookSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    const student = row.students;
    return [student?.first_name, student?.last_name, student?.student_number]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          "id, title, category, points_possible, due_date, description, submission_mode, rubric_id, created_at, status",
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
  const { data: allGrades = [] } = useQuery({
    queryKey: ["grades", classId, assignmentIds.length],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, assignment_id, student_id, points_earned, comment, is_draft")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data;
    },
  });
  // Students only ever see their own posted grades.
  const grades = previewing
    ? allGrades.filter((g) => g.student_id === testerId && !g.is_draft)
    : allGrades;

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
        // Honour special marks the same way each student's average does:
        // "M" (missing) counts as zero, excused work is excluded entirely.
        const countedScores = possible > 0
          ? grades.flatMap((grade) => {
              if (grade.assignment_id !== assignment.id) return [];
              if (testerIds.has(grade.student_id)) return [];
              const mark = findMark(markCodeFromComment(grade.comment), setup.marks);
              let earned: number | null =
                grade.points_earned == null ? null : Number(grade.points_earned);
              if (mark) {
                if (mark.behavior === "exclude") return [];
                if (mark.behavior === "zero") earned = 0;
                if (mark.behavior === "value") {
                  earned = (Number(mark.value ?? 0) / 100) * possible;
                }
              }
              if (earned == null) return [];
              return [(earned / possible) * 100];
            })
          : [];
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
    setup,
    testerIds,
  ]);

  const assignmentPageCount = Math.max(1, Math.ceil(gradebookRows.length / 3));
  const currentAssignmentPage = Math.min(assignmentPage, assignmentPageCount - 1);
  const pageAssignments = gradebookRows.slice(currentAssignmentPage * 3, currentAssignmentPage * 3 + 3);

  function printGradebook() {
    const headerCells = gradebookRows
      .map(
        ({ assignment, average }) =>
          `<th>${escapeHtml(assignment.title)}<br /><span class="muted">${Number(
            assignment.points_possible,
          )} pts${average == null ? "" : ` · ${average.toFixed(0)}% avg`}</span></th>`,
      )
      .join("");
    const bodyRows = visibleGradebookRoster
      .filter((row) => !testerIds.has(row.student_id))
      .map((row) => {
        const average = studentAverage(row.student_id);
        const missingCount = gradebookRows.filter(({ assignment }) => {
          const grade = gradeFor(row.student_id, assignment.id);
          return markCodeFromComment(grade?.comment) === "M";
        }).length;
        const cells = gradebookRows
          .map(({ assignment }) => {
            const grade = gradeFor(row.student_id, assignment.id);
            const markCode = markCodeFromComment(grade?.comment);
            if (markCode) return `<td class="num">${escapeHtml(markCode)}</td>`;
            if (grade?.points_earned == null) return `<td class="num muted">—</td>`;
            return `<td class="num">${Number(grade.points_earned).toLocaleString()}</td>`;
          })
          .join("");
        return `<tr><td>${escapeHtml(studentLabel(row.students, useIds))}${
          !useIds && row.students?.student_number
            ? `<br /><span class="muted">ID ${escapeHtml(row.students.student_number)}</span>`
            : ""
        }</td><td class="num">${
          average == null
            ? "—"
            : `${average.toFixed(1)}% (${escapeHtml(letterFor(average, setup.scale))})`
        }</td><td class="num">${missingCount > 0 ? missingCount : "—"}</td>${cells}</tr>`;
      })
      .join("");
    const html = buildDocument(
      `Gradebook — ${klass?.name ?? "Class"}`,
      `${docHeader("Class gradebook", [
        klass ? `${klass.name}${klass.subject ? ` · ${klass.subject}` : ""}` : "Class",
        klass?.term ?? "",
        `${visibleGradebookRoster.length} students · ${gradebookRows.length} assignments`,
      ])}
      <table><tr><th>Student</th><th>Current grade</th><th>Missing</th>${headerCells}</tr>
      ${bodyRows || `<tr><td colspan="${gradebookRows.length + 3}" class="muted">No students match.</td></tr>`}</table>
      <p class="muted">M = missing · blank = not yet graded. Current grade follows the class grading setup.</p>`,
    );
    printHtml(html);
  }

  return (
    <StudentPreviewContext.Provider value={previewing ? testerId : null}>
    <AppShell
      desktopReview
      title={
        isStaff && switcherClasses.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md px-1 -mx-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Switch class"
              >
                {klass?.name ?? "Class"}
                <ChevronsUpDown className="h-5 w-5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {switcherClasses.map((c) => (
                <DropdownMenuItem key={c.id} asChild>
                  <Link
                    to="/classes/$classId"
                    params={{ classId: c.id }}
                    className={c.id === classId ? "font-semibold" : undefined}
                  >
                    {c.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.period ? `Period ${c.period} · ` : ""}
                      {c.term}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          (klass?.name ?? "Class")
        )
      }
      description={
        klass
          ? isStaff
            ? `${klass.subject ?? "General"} · Period ${klass.period ?? "—"} · Room ${klass.room ?? "—"} · ${klass.term}`
            : `${klass.subject ?? "General"} · Period ${klass.period ?? "—"}`
          : undefined
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {isStaff && testerId && (
            <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
              View as student
            </Button>
          )}
          {isStaff && <CoTeachersPanel classId={classId} />}
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
      {previewing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <span>
            <strong>Student view preview</strong> — you're seeing this class as the demo Student Tester sees it. Nothing here affects real grades.
          </span>
          <Button size="sm" onClick={() => setPreviewing(false)}>Exit student view</Button>
        </div>
      )}
      <Tabs defaultValue="gradebook" key={previewing ? "preview" : "staff"}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pb-3">
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
              <TabsTrigger value="grading" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">
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
          <section className="coursework-ledger mt-6 border-y border-border/70 bg-card">
            {roster.length === 0 || assignments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {isStaff
                  ? "Add students to the roster and create assignments to see the gradebook."
                  : "Your teacher will add assignments and scores here."}
              </p>
            ) : (
              <div>
                <header className="border-b border-border/60 bg-card p-4">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                     <div>
                      <h2 className="text-lg font-semibold">{isStaff ? "Class gradebook" : "My gradebook"}</h2>
                      <p className="text-sm text-muted-foreground">
                        {isStaff ? `${roster.length} ${roster.length === 1 ? "student" : "students"} · ` : ""}{gradebookRows.length} of {assignments.length} assignments
                      </p>
                    </div>
                    {isStaff && (
                      <Button type="button" variant="outline" size="sm" onClick={printGradebook} disabled={gradebookRows.length === 0 || visibleGradebookRoster.length === 0}>
                        <Printer className="size-4" /> Print gradebook
                      </Button>
                    )}
                    {isStaff && <div className="grid w-full gap-3 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1 lg:col-span-2">
                        <Label htmlFor="gradebook-search" className="text-xs">Find student</Label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="gradebook-search"
                            value={gradebookSearch}
                            onChange={(event) => setGradebookSearch(event.target.value)}
                            placeholder="Name or student ID"
                            className="pl-8"
                          />
                        </div>
                      </div>
                      <div className="space-y-1 lg:col-span-2">
                        <Label className="text-xs">Student order</Label>
                        <StudentSortControl value={gradebookSort} onChange={setGradebookSort} className="w-full" />
                      </div>
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
                    </div>}
                  </div>
                </header>

                 {gradebookRows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No assignments match these filters.
                  </p>
                 ) : visibleGradebookRoster.length === 0 ? (
                   <p className="p-8 text-center text-sm text-muted-foreground">
                     No students match that search.
                   </p>
                ) : (
                     <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">Assignments {currentAssignmentPage * 3 + 1}–{Math.min((currentAssignmentPage + 1) * 3, gradebookRows.length)} of {gradebookRows.length}</p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" aria-label="Previous assignments" disabled={currentAssignmentPage === 0} onClick={() => setAssignmentPage(currentAssignmentPage - 1)}><ChevronLeft className="size-4" /></Button>
                        <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">{currentAssignmentPage + 1} / {assignmentPageCount}</span>
                        <Button variant="outline" size="icon" aria-label="Next assignments" disabled={currentAssignmentPage >= assignmentPageCount - 1} onClick={() => setAssignmentPage(currentAssignmentPage + 1)}><ChevronRight className="size-4" /></Button>
                      </div>
                    </div>
                    <div className="max-h-[68vh] overflow-y-auto">

                     <table className="w-full table-fixed border-collapse text-sm">
                       <thead className="sticky top-0 z-20 border-b border-border/60 bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                            {isStaff && <th className="sticky left-0 z-30 w-[26%] border-r border-border/60 bg-muted/50 px-4 py-3 text-left font-semibold">Student</th>}
                            <th className="w-[18%] border-r border-border/60 bg-muted/30 px-4 py-3 text-center font-semibold text-foreground">Current grade</th>
                            <th className="w-[10%] border-r border-border/60 px-3 py-3 text-center font-semibold">Missing</th>
                           {pageAssignments.map(({ assignment, average }) => (
                              <th key={assignment.id} className="border-r border-border/60 px-3 py-3 text-center font-semibold normal-case">
                               <span className="block break-words text-foreground" title={assignment.title}>{assignment.title}</span>
                               <span className="mt-1 block font-normal text-muted-foreground">
                                 {Number(assignment.points_possible)} pts{average == null ? "" : ` · ${average.toFixed(0)}% avg`}
                               </span>
                             </th>
                           ))}
                        </tr>
                      </thead>
                       <tbody className="divide-y divide-border">
                         {visibleGradebookRoster.map((row, rowIndex) => {
                           const average = studentAverage(row.student_id);
                           const missingCount = gradebookRows.filter(({ assignment }) => {
                             const grade = gradeFor(row.student_id, assignment.id);
                             const code = markCodeFromComment(grade?.comment);
                             return code === "M";
                           }).length;
                           return (
                              <tr key={row.id} className={`${rowIndex % 2 === 0 ? "bg-card hover:bg-muted/25" : "bg-muted/10 hover:bg-muted/25"}${testerIds.has(row.student_id) ? " opacity-70" : ""}`}>
                                {isStaff && <td className="sticky left-0 z-10 border-r border-border/60 bg-inherit px-4 py-3">
                                 <Button
                                   type="button"
                                   variant="link"
                                   className="h-auto w-full justify-start whitespace-normal break-words p-0 text-left font-semibold text-foreground"
                                   onClick={() => setGradebookReportStudentId(row.student_id)}
                                 >
                                   {studentLabel(row.students, useIds)}
                                 </Button>
                                 <TestAccountBadge student={row.students} />
                                 {!useIds && row.students?.student_number && (
                                   <p className="mt-0.5 text-xs text-muted-foreground">ID {row.students.student_number}</p>
                                 )}
                               </td>}
                                <td className="border-r border-border/60 bg-muted/15 px-4 py-3 text-center">
                                 {average == null ? (
                                   <span className="text-muted-foreground">—</span>
                                 ) : (
                                    <div className="inline-flex flex-wrap items-center justify-center gap-1">
                                      <span className={`size-1.5 shrink-0 rounded-full ${average >= 80 ? "bg-success" : average >= 70 ? "bg-warning" : "bg-destructive"}`} aria-hidden />
                                      <span className="font-semibold tabular-nums text-foreground">
                                       {average.toFixed(1)}%
                                     </span>
                                     <span className="text-xs font-semibold text-muted-foreground">{letterFor(average, setup.scale)}</span>
                                   </div>
                                 )}
                               </td>
                                <td className="border-r border-border/60 px-3 py-3 text-center">
                                 {missingCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-destructive"><AlertCircle className="size-3.5" />{missingCount}</span>
                                 ) : (
                                   <span className="text-muted-foreground">—</span>
                                 )}
                               </td>
                                {pageAssignments.map(({ assignment }) => {
                                  const grade = gradeFor(row.student_id, assignment.id);
                                  const markCode = markCodeFromComment(grade?.comment);
                                  const isDraft = Boolean(grade?.is_draft);
                                  return (
                                     <td key={assignment.id} className="border-r border-border/60 px-3 py-3 text-center tabular-nums">
                                      <span className="inline-flex items-center justify-center gap-1.5">
                                        {markCode ? (
                                           <Badge variant="outline" className={markCode === "M" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border/70 bg-muted/40 text-muted-foreground"}>{markCode}</Badge>
                                        ) : grade?.points_earned == null ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          <span className="font-medium text-foreground">{Number(grade.points_earned).toLocaleString()}</span>
                                        )}
                                        {isStaff && isDraft ? (
                                          <span
                                            className="size-1.5 shrink-0 rounded-full bg-warning"
                                            title="Draft grade — only you can see it until posted"
                                            aria-label="Draft grade"
                                          />
                                        ) : null}
                                        {isStaff && grade ? (
                                          <GradeHistoryButton
                                            assignmentId={assignment.id}
                                            studentId={row.student_id}
                                          />
                                        ) : null}
                                      </span>
                                    </td>
                                  );
                                })}
                             </tr>
                           );
                         })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                   <div className="flex flex-wrap gap-4">
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-success" />80%+ proficient</span>
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-warning" />70–79% approaching</span>
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-destructive" />Below 70% needs support</span>
                   </div>
                   {isStaff && <span>Click a student name for the full report.</span>}
                 </footer>
              </div>
            )}
          </section>
           {isStaff && (
             <StudentClassReport
               open={!!gradebookReportStudentId}
               onOpenChange={(open) => {
                 if (!open) setGradebookReportStudentId(null);
               }}
               classId={classId}
               className={klass?.name ?? "Class"}
                student={roster.find((row) => row.student_id === gradebookReportStudentId)?.students ?? null}
                assignments={assignments}
                grades={grades.filter((g) => !g.is_draft)}
               setup={setup}
               displayName={studentLabel(roster.find((row) => row.student_id === gradebookReportStudentId)?.students, useIds)}
             />
           )}
          {!isStaff && <FeedbackInbox classId={classId} />}
        </TabsContent>

        <TabsContent value="coursework">
          <CourseworkAverages
            assignments={assignments}
            grades={grades}
            setup={setup}
            isStaff={isStaff}
            studentIds={roster.filter((r) => !testerIds.has(r.student_id)).map((r) => r.student_id)}
          />
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
    </StudentPreviewContext.Provider>
  );
}

/** Staff-only "History" popover: every posted score/feedback change for a cell. */
function GradeHistoryButton({
  assignmentId,
  studentId,
}: {
  assignmentId: string;
  studentId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: changes = [] } = useQuery({
    queryKey: ["grade-changes", assignmentId, studentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grade_changes")
        .select(
          "id, old_score, new_score, old_feedback, new_feedback, reason, changed_at",
        )
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Score history"
          title="Score history"
        >
          <History className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80">
        <p className="text-sm font-semibold">Score history</p>
        {changes.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No posted changes recorded yet.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {changes.map((change) => (
              <li key={change.id} className="rounded-md border border-border/60 p-2 text-xs">
                <p className="font-medium">
                  {change.old_score == null ? "—" : String(change.old_score)} →{" "}
                  {change.new_score == null ? "—" : String(change.new_score)}
                </p>
                {change.new_feedback && change.new_feedback !== change.old_feedback ? (
                  <p className="mt-0.5 break-words text-muted-foreground">
                    “{change.new_feedback}”
                  </p>
                ) : null}
                {change.reason ? (
                  <p className="mt-0.5 text-muted-foreground">Reason: {change.reason}</p>
                ) : null}
                <p className="mt-0.5 text-muted-foreground">
                  {new Date(change.changed_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
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
  status?: string;
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
    is_draft?: boolean | null;
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
  const [notify, setNotify] = useState<NotifyValue>(noNotify);
  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string } | null>(null);
  const sendNotify = useNotifyCoursework();
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
    mutationFn: async (status: "draft" | "published") => {
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

      const { data: inserted, error } = await supabase.from("assignments").insert(
        targets.map((cid) => ({
          ...base,
          class_id: cid,
          status,
          // A rubric belongs to one class, so only the original class keeps it.
          rubric_id: cid === classId ? form.rubricId || null : null,
        })),
      ).select("id");
      if (error) throw error;
      return { count: targets.length, status, ids: (inserted ?? []).map((r) => r.id) };
    },
    onSuccess: ({ count, status, ids }) => {
      toast.success(
        status === "draft"
          ? count > 1
            ? `Draft saved to ${count} classes — students can't see it yet`
            : "Draft saved — students can't see it yet"
          : count > 1
            ? `Assignment published to ${count} classes`
            : "Assignment published",
      );
      if (status === "published") sendNotify("assignment", ids, notify);
      setNotify(noNotify);
      setOpen(false);
      setForm(blank);
      setApplyToSubject(false);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const publishAssignment = useMutation({
    mutationFn: async (input: { id: string; notify: NotifyValue }) => {
      const { error } = await supabase
        .from("assignments")
        .update({ status: "published" })
        .eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      toast.success("Assignment published — students can see it now");
      setPublishTarget(null);
      sendNotify("assignment", [input.id], input.notify);
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postDrafts = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("grades")
        .update({ is_draft: false, posted_at: new Date().toISOString(), posted_by: auth.user?.id ?? null })
        .eq("assignment_id", assignmentId)
        .eq("is_draft", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Draft grades posted — students and guardians can see them now");
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-grades"] });
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
              <NotifyChoices value={notify} onChange={setNotify} idPrefix="new-assignment" />
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={formDirty} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => create.mutate("draft")}
                  disabled={create.isPending}
                >
                  Save as draft
                </Button>
                <Button onClick={() => create.mutate("published")} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Publish"}
                </Button>
              </div>
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
                    const testerIds = new Set(
                      roster.filter((r) => isTestStudent(r.students)).map((r) => r.student_id),
                    );
                    const scoredCount = grades.filter(
                      (grade) =>
                        grade.assignment_id === a.id &&
                        grade.points_earned != null &&
                        !testerIds.has(grade.student_id),
                    ).length;
                    const realRosterCount = roster.length - testerIds.size;
                    const fullyScored = realRosterCount > 0 && scoredCount === realRosterCount;
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
                              {a.status === "draft" ? (
                                <Badge
                                  variant="outline"
                                  className="border-warning/60 bg-warning/15 text-warning-foreground"
                                >
                                  Draft — hidden from students
                                </Badge>
                              ) : null}
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
                                {scoredCount}/{realRosterCount} scored
                              </Badge>
                            ) : null}
                            {isStaff && (() => {
                              const drafts = grades.filter(
                                (grade) => grade.assignment_id === a.id && grade.is_draft,
                              ).length;
                              if (drafts === 0) return null;
                              const label = `${drafts} draft ${drafts === 1 ? "grade" : "grades"}`;
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-warning/60"
                                  disabled={postDrafts.isPending}
                                  onClick={() => {
                                    if (window.confirm(`Post ${label} to students and guardians? They will see scores and feedback immediately.`)) {
                                      postDrafts.mutate(a.id);
                                    }
                                  }}
                                >
                                  Post {label}
                                </Button>
                              );
                            })()}
                            {isStaff && (
                              <>
                                {a.status === "draft" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => setPublishTarget({ id: a.id, title: a.title })}
                                    disabled={publishAssignment.isPending}
                                  >
                                    Publish
                                  </Button>
                                ) : null}
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
      queryClient.invalidateQueries({ queryKey: ["assessment-reopened"] });
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
        .select(
          "id, first_name, last_name, grade_level, student_number, user_id, guardian_user_id",
        )
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

      {isStaff ? <UnlinkedAccounts students={students} classId={classId} /> : null}


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
                 <TestAccountBadge student={r.students} />
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
