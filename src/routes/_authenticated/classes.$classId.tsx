import { SchoolCalendar } from "@/components/SchoolCalendar";
import { missingMarkValue, missingPointsFor, type LatePenaltySettings } from "@/lib/late-penalty";
import { isMissingWork } from "@/lib/missing-work";
import { gradingAttentionSummary } from "@/lib/class-attention";
import { withDiscussionSubmissions } from "@/lib/discussion-completion";
import { courseworkBucket, isDueSoon, needsCourseworkAttention } from "@/lib/coursework-view";
import { todayKey } from "@/lib/assignment-status";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ClipboardList, Clock, History, MoreVertical, Printer, Search } from "lucide-react";

const UNDERLINE_TAB =
  "-mb-px rounded-none border-b-2 border-transparent px-3 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { StudentPreviewContext } from "@/hooks/useStudentPreview";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/query";
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
import { LatePenaltyFields, LATE_PENALTY_BLANK, latePenaltyColumns, latePenaltyFormFrom } from "@/components/class/LatePenaltyFields";
import { CourseworkAverages } from "@/components/class/CourseworkAverages";
import { GradebookOverview } from "@/components/class/GradebookOverview";
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
import { copyResourceToClasses } from "@/lib/sharing.functions";
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
import { notifyGradesPosted } from "@/lib/grade-notify.functions";

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
  const { realStaff, previewingStudent, isAdmin, user, profile } = useAuth();
  const [classTab, setClassTab] = useState("gradebook");
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [courseworkAttention, setCourseworkAttention] = useState<{ key: QuickKey; request: number } | null>(null);
  const [guardianChildId, setGuardianChildId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState("gradebook");
  // Coursework cards for discussion assignments can jump to the Discussion board tab.
  useEffect(() => {
    const open = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (!tab) return;
      setClassTab(tab);
      setPreviewTab(tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("meraki:open-class-tab", open);
    return () => window.removeEventListener("meraki:open-class-tab", open);
  }, []);
  useEffect(() => {
    setClassTab("gradebook");
    setPreviewTab("gradebook");
  }, [previewingStudent]);
  const queryClient = useQueryClient();
  const { useIds, toggle: toggleIds } = useRosterPrivacy();
  const [gradebookSort, setGradebookSort] = useStudentSort(`class-gradebook-${classId}`);
  const [gradebookSearch, setGradebookSearch] = useState("");
  const [gradebookView, setGradebookView] = useState("overview");
  const [hideOverviewGrades, setHideOverviewGrades] = useState(false);
  const [assignmentPage, setAssignmentPage] = useState(0);
  // Fewer assignment columns on laptops/tablets so scores never get squeezed.
  const [gradebookPerPage, setGradebookPerPage] = useState(3);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setGradebookPerPage(mq.matches ? 3 : 2);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
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
      const data = await fetchAll((from, to) => supabase
        .from("enrollments")
        .select("id, student_id, created_at, students(id, first_name, last_name, grade_level, student_number, is_tester)")
        .eq("class_id", classId).order("id").range(from, to));
      return data.filter((r) => r.students);
    },
  });
  const [showDropped, setShowDropped] = useState(false);
  const { data: droppedRoster = [] } = useQuery({
    queryKey: ["dropped-roster", classId],
    enabled: realStaff && showDropped,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dropped_enrollments")
        .select("id, student_id, enrolled_at, dropped_at, students(id, first_name, last_name, grade_level, student_number, is_tester)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.students)
        .map((r) => ({ id: r.id, student_id: r.student_id, created_at: r.enrolled_at ?? r.dropped_at, students: r.students, droppedAt: r.dropped_at as string | null }));
    },
  });
  const testerId = fullRoster.find((r) => isTestStudent(r.students))?.student_id ?? null;
  const previewing = previewingStudent && realStaff && !!testerId;
  const isStaff = realStaff && !previewing;
  // Guardians with several children in this class pick one child at a time.
  const guardianChildren = !realStaff && !previewing && fullRoster.length > 1 ? fullRoster : [];
  const activeGuardianChild = guardianChildren.length
    ? (guardianChildren.find((r) => r.student_id === guardianChildId) ?? guardianChildren[0]!).student_id
    : null;
  const roster = previewing
    ? fullRoster.filter((r) => r.student_id === testerId)
    : activeGuardianChild
      ? fullRoster.filter((r) => r.student_id === activeGuardianChild)
      : fullRoster;
  // Demo/test accounts stay visible but never count toward class statistics.
  const testerIds = useMemo(
    () => new Set(roster.filter((r) => isTestStudent(r.students)).map((r) => r.student_id)),
    [roster],
  );
  const gradebookRoster = sortStudents(
    [
      ...roster.map((r) => ({ ...r, droppedAt: null as string | null })),
      ...(realStaff && !previewing && showDropped ? droppedRoster.filter((d) => !roster.some((r) => r.student_id === d.student_id)) : []),
    ],
    gradebookSort,
    (row) => row.students,
  );
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
      return fetchAll((from, to) => supabase
        .from("assignments")
        .select(
          "id, title, category, points_possible, due_date, description, submission_mode, rubric_id, created_at, status, late_penalty_enabled, late_penalty_mode, late_penalty_per_day, late_penalty_zero_after_days",
        )
        .eq("class_id", classId)
        .order("due_date", { ascending: true }).order("id").range(from, to));
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
      return fetchAll((from, to) =>
        supabase
          .from("grades")
          .select("id, assignment_id, student_id, points_earned, comment, is_draft, posted_at, updated_at")
          .in("assignment_id", assignmentIds)
          .order("id")
          .range(from, to),
      );
    },
  });
  // Students and guardians only ever see posted grades.
  const grades = previewing
    ? allGrades.filter((g) => g.student_id === testerId && !g.is_draft)
    : isStaff
      ? allGrades
      : allGrades.filter((g) => !g.is_draft);

  const gradeFor = (studentId: string, assignmentId: string) =>
    grades.find((g) => g.student_id === studentId && g.assignment_id === assignmentId);

  const { data: gradebookSubmissions = [] } = useQuery({
    queryKey: ["gradebook-submissions", classId, assignmentIds.length],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const data = await fetchAll((from, to) =>
        supabase
          .from("assignment_submissions")
          .select("assignment_id, student_id")
          .in("status", ["submitted", "collected", "returned"])
          .in("assignment_id", assignmentIds)
          .order("id")
          .range(from, to),
      );
      return withDiscussionSubmissions(data, assignmentIds);
    },
  });
  const submittedKeys = useMemo(
    () => new Set(gradebookSubmissions.map((s) => `${s.student_id}:${s.assignment_id}`)),
    [gradebookSubmissions],
  );
  const gradebookEnrollmentFor = (studentId: string) =>
    gradebookRoster.find((r) => r.student_id === studentId);
  const enrolledAtFor = (studentId: string) =>
    gradebookEnrollmentFor(studentId)?.created_at ?? null;
  const missingFor = (studentId: string, assignment: { id: string; due_date?: string | null; created_at?: string | null; status?: string | null }) =>
    isMissingWork({
      assignment,
      grade: gradeFor(studentId, assignment.id),
      submitted: submittedKeys.has(`${studentId}:${assignment.id}`),
      enrolledAt: enrolledAtFor(studentId),
      droppedAt: gradebookEnrollmentFor(studentId)?.droppedAt ?? null,
    });

  // Per-assignment counts for the Coursework tab quick filters (test accounts excluded).
  const { courseworkMissing, courseworkUngraded } = useMemo(() => {
    const missing: Record<string, number> = {};
    const ungraded: Record<string, number> = {};
    const realStudents = gradebookRoster
      .filter((r) => !isTestStudent(r.students) && !r.droppedAt)
      .map((r) => r.student_id);
    for (const a of assignments) {
      let m = 0;
      let u = 0;
      for (const sid of realStudents) {
        const g = grades.find((x) => x.student_id === sid && x.assignment_id === a.id);
        const submitted = submittedKeys.has(`${sid}:${a.id}`);
        if (isMissingWork({ assignment: a, grade: g, submitted, enrolledAt: enrolledAtFor(sid), droppedAt: gradebookEnrollmentFor(sid)?.droppedAt ?? null })) m++;
        if (submitted && (g?.points_earned == null) && !markCodeFromComment(g?.comment)) u++;
      }
      missing[a.id] = m;
      ungraded[a.id] = u;
    }
    return { courseworkMissing: missing, courseworkUngraded: ungraded };
  }, [assignments, grades, gradebookRoster, submittedKeys]);

  function studentAverage(studentId: string) {
    return computeAverage(
      assignments.map((a) => {
        const g = gradeFor(studentId, a.id);
        return {
          category: a.category,
          pointsPossible: Number(a.points_possible),
          pointsEarned: g?.points_earned == null ? null : Number(g.points_earned),
          markCode: markCodeFromComment(g?.comment),
          missingPoints: missingPointsFor(a, timeZone),
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

  const perPage = gradebookPerPage;
  const assignmentPageCount = Math.max(1, Math.ceil(gradebookRows.length / perPage));
  const currentAssignmentPage = Math.min(assignmentPage, assignmentPageCount - 1);
  const pageAssignments = gradebookRows.slice(currentAssignmentPage * perPage, currentAssignmentPage * perPage + perPage);

  const showOverview = isStaff && gradebookView === "overview";
  const overviewStudents = showOverview ? gradebookRoster.map((row) => ({
    id: row.student_id,
    name: studentLabel(row.students, useIds),
    average: studentAverage(row.student_id),
    missing: assignments.filter((assignment) => missingFor(row.student_id, assignment)).length,
    excluded: isTestStudent(row.students) || !!row.droppedAt,
    note: row.droppedAt ? `Dropped ${formatDate(row.droppedAt)}` : isTestStudent(row.students) ? "Test account" : null,
  })) : [];
  const visibleOverviewIds = new Set(visibleGradebookRoster.map((row) => row.student_id));
  const snapshotRoster = gradebookRoster.filter((r) => !isTestStudent(r.students) && !r.droppedAt);
  const snapshotIds = new Set(snapshotRoster.map((r) => r.student_id));
  const snapshotMissing = new Map(snapshotRoster.map((r) => [r.student_id, new Set(assignments.filter((a) => missingFor(r.student_id, a)).map((a) => a.id))]));
  const snapshotGrading = gradingAttentionSummary(courseworkUngraded, grades, snapshotIds);
  function openGradingAttention() {
    setCourseworkAttention((current) => ({ key: "attention", request: (current?.request ?? 0) + 1 }));
    setClassTab("coursework");
  }


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
        const missingCount = gradebookRows.filter(({ assignment }) => missingFor(row.student_id, assignment)).length;
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
      <p class="muted">Missing = marked M, or past due with nothing turned in · blank = not yet graded. Current grade follows the class grading setup.</p>`,
    );
    printHtml(html);
  }

  return (
    <StudentPreviewContext.Provider value={previewing ? testerId : null}>
    <AppShell
      desktopReview
      breadcrumbContext={{
        label: klass?.name ?? "Class",
        section: ({ gradebook: isStaff ? "Gradebook" : "My grades", coursework: "Coursework", discussions: "Discussion board", rubrics: "Rubrics", shared: "Shared library", roster: "Roster", attendance: "Attendance", files: "Files", grading: "Grading setup" } as Record<string, string>)[previewing ? previewTab : classTab] ?? "Gradebook",
        onNavigate: () => previewing ? setPreviewTab("gradebook") : setClassTab("gradebook"),
      }}
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
          {isStaff && <CoTeachersPanel classId={classId} />}
          {isStaff && (
            <Button variant="ghost" size="sm" onClick={toggleIds}>
              {useIds ? "Show names" : "Show student IDs"}
            </Button>
          )}
          {isStaff && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/behavior" search={{ classId }}>Behavior log</Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/classes">All classes</Link>
          </Button>
        </div>
      }
    >
      {guardianChildren.length > 0 && (
        <div role="group" aria-label="Choose child" className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing:</span>
          {guardianChildren.map((r) => (
            <Button
              key={r.student_id}
              size="sm"
              variant={r.student_id === activeGuardianChild ? "secondary" : "ghost"}
              aria-pressed={r.student_id === activeGuardianChild}
              onClick={() => setGuardianChildId(r.student_id)}
            >
              {r.students?.first_name} {r.students?.last_name}
            </Button>
          ))}
        </div>
      )}
      {isStaff && <PulseDashboard
        key={`today-${classId}`}
        classId={classId}
        className={klass?.name ?? "this class"}
        roster={gradebookRoster}
        assignments={assignments}
        grades={grades}
        setup={setup}
        isStaff={isStaff}
        useIds={useIds}
        studentAverage={studentAverage}
        teacherToday
        hideGrades={hideOverviewGrades}
        dateKey={todayKey()}
        missingByStudent={snapshotMissing}
        gradingSummary={snapshotGrading}
        onGradingAttention={openGradingAttention}
      />}
      <div className={isStaff ? "mt-6 space-y-6" : undefined}>
      <Tabs value={previewing ? previewTab : classTab} onValueChange={previewing ? setPreviewTab : setClassTab} key={previewing ? "preview" : "staff"}>
        {(() => {
          const current = previewing ? previewTab : classTab;
          const go = previewing ? setPreviewTab : setClassTab;
          const groups: { key: string; label: string; tabs: { value: string; label: string }[] }[] = [
            { key: "grades", label: isStaff ? "Gradebook" : "My grades", tabs: [{ value: "gradebook", label: isStaff ? "Gradebook" : "My grades" }] },
            { key: "work", label: "Coursework", tabs: [{ value: "coursework", label: "Coursework" }, { value: "calendar", label: "Calendar" }] },
            { key: "talk", label: "Discussions", tabs: [{ value: "discussions", label: "Discussion board" }] },
            { key: "people", label: isStaff ? "Students" : "Attendance", tabs: [
              ...(isStaff ? [{ value: "roster", label: "Roster" }] : []),
              { value: "attendance", label: "Attendance" },
            ] },
            { key: "more", label: isStaff ? "Settings & files" : "Files", tabs: [
              { value: "files", label: "Files" },
              ...(isStaff ? [
                { value: "grading", label: "Grading setup" },
                { value: "rubrics", label: "Rubrics" },
                { value: "shared", label: "Shared library" },
              ] : []),
            ] },
          ];
          const active = groups.find((g) => g.tabs.some((t) => t.value === current)) ?? groups[0];
          if (!active) return null;
          const secondaryActive = !["gradebook", "coursework", "calendar", "attendance"].includes(current);
          const primaryGroups = isStaff ? groups.filter((g) => ["grades", "work", "people"].includes(g.key)) : groups;
          return (
            <div className="space-y-3">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
                {primaryGroups.map((g) => {
                  const target = isStaff && g.key === "people" ? "attendance" : g.tabs[0]?.value;
                  if (!target) return null;
                  return <TabsTrigger key={g.key} value={g.key === active.key && !secondaryActive ? current : target} className={UNDERLINE_TAB} onClick={() => go(target)}>
                    {isStaff && g.key === "people" ? "Attendance" : g.label}
                  </TabsTrigger>;
                })}
              </TabsList>
              {isStaff && <>
                <Button variant="ghost" size="sm" aria-expanded={moreToolsOpen || secondaryActive} aria-controls="classroom-more-tools" onClick={() => {
                  if (secondaryActive) go("gradebook");
                  setMoreToolsOpen(!(moreToolsOpen || secondaryActive));
                }}>
                  <ChevronDown className={moreToolsOpen || secondaryActive ? "" : "-rotate-90"} /> More classroom tools
                </Button>
                {(moreToolsOpen || secondaryActive) && <div id="classroom-more-tools" className="flex flex-wrap gap-x-8 gap-y-4 border-b border-border pb-4">
                  {groups.filter((g) => ["talk", "people", "more"].includes(g.key)).map((g) => <div key={g.key} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
                    <div role="group" aria-label={`${g.label} sections`} className="flex flex-wrap gap-1">
                      {g.tabs.filter((t) => t.value !== "attendance").map((t) => <Button key={t.value} size="sm" variant={t.value === current ? "secondary" : "ghost"} aria-pressed={t.value === current} onClick={() => go(t.value)}>{t.label}</Button>)}
                    </div>
                  </div>)}
                </div>}
              </>}
              {active.tabs.length > 1 && (!isStaff || active.key === "work") && (
                <div role="group" aria-label={`${active.label} sections`} className="flex flex-wrap gap-1">
                  {active.tabs.map((t) => (
                    <Button key={t.value} size="sm" variant={t.value === current ? "secondary" : "ghost"} aria-pressed={t.value === current} onClick={() => go(t.value)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}



        <TabsContent value="gradebook">
          {isStaff && <Tabs value={gradebookView} onValueChange={setGradebookView} className="mt-4">
            <TabsList aria-label="Gradebook view"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="grid">Grid</TabsTrigger></TabsList>
          </Tabs>}
          {!isStaff && !showOverview && <PulseDashboard
            classId={classId}
            className={klass?.name ?? "this class"}
            roster={gradebookRoster}
            assignments={assignments}
            grades={grades}
            setup={setup}
            isStaff={isStaff}
            useIds={useIds}
            studentAverage={studentAverage}
          />}
          {!showOverview && assignments.length > 0 && (
            <details className="group/avg mt-6 rounded-lg border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span>Averages overview</span>
                <span className="text-xs font-normal text-muted-foreground group-open/avg:hidden">Show</span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open/avg:inline">Hide</span>
              </summary>
              <div className="border-t border-border px-4 pt-4">
                <CourseworkAverages
                  assignments={assignments}
                  grades={grades}
                  setup={setup}
                  isStaff={isStaff}
                  studentIds={roster.filter((r) => !testerIds.has(r.student_id)).map((r) => r.student_id)}
                />
              </div>
            </details>
          )}
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
                    {isStaff && (<div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={openGradingAttention}>Grade work</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={printGradebook} disabled={gradebookRows.length === 0 || visibleGradebookRoster.length === 0 || (showOverview && hideOverviewGrades)}>
                        <Printer className="size-4" /> Print gradebook
                      </Button>
                    </div>)}
                    {isStaff && <div className="flex w-full flex-wrap items-center gap-3 border-t border-border pt-4">
                      <div className="relative w-full sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="gradebook-search"
                          aria-label="Search student by name or student ID"
                          value={gradebookSearch}
                          onChange={(event) => setGradebookSearch(event.target.value)}
                          placeholder="Search student..."
                          className="pl-8"
                        />
                      </div>
                      <Select value={gradebookCategory} onValueChange={setGradebookCategory}>
                        <SelectTrigger id="gradebook-category" className="w-full sm:w-56" aria-label="Filter assignments by category">
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
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox checked={showDropped} onCheckedChange={(v) => setShowDropped(v === true)} aria-label="Show dropped students" />
                        Show dropped students
                      </label>
                    </div>}
                  </div>
                </header>

                 {showOverview ? (
                   <GradebookOverview
                     key={classId}
                     students={overviewStudents}
                     visibleStudents={overviewStudents.filter((student) => visibleOverviewIds.has(student.id))}
                     assignments={gradebookRows.map((row) => row.assignment)}
                     allAssignments={assignments}
                     setup={setup}
                     scoredCounts={new Map(gradebookRows.map((row) => [row.assignment.id, row.scoredCount]))}
                     ungradedCounts={courseworkUngraded}
                     hideGrades={hideOverviewGrades}
                     onHideGrades={setHideOverviewGrades}
                     onStudent={setGradebookReportStudentId}
                     onCoursework={() => setClassTab("coursework")}
                   />
                 ) : gradebookRows.length === 0 ? (
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
                      <p className="text-xs text-muted-foreground">Assignments {currentAssignmentPage * perPage + 1}–{Math.min((currentAssignmentPage + 1) * perPage, gradebookRows.length)} of {gradebookRows.length}</p>
                      <div className="flex items-center gap-2">
                        {isStaff && (
                          <Select
                            value={`${gradebookAssignmentSort}:${gradebookSortDirection}`}
                            onValueChange={(value) => {
                              const [field, dir] = value.split(":");
                              setGradebookAssignmentSort(field as typeof gradebookAssignmentSort);
                              setGradebookSortDirection(dir as "asc" | "desc");
                            }}
                          >
                            <SelectTrigger className="h-9 w-auto gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none" aria-label="Order assignments">
                              <ArrowUpDown className="size-3.5" />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                              <SelectItem value="due_date:asc">Due date, oldest first</SelectItem>
                              <SelectItem value="due_date:desc">Due date, newest first</SelectItem>
                              <SelectItem value="title:asc">Assignment name, A–Z</SelectItem>
                              <SelectItem value="category:asc">Category</SelectItem>
                              <SelectItem value="average:desc">Class average, high to low</SelectItem>
                              <SelectItem value="average:asc">Class average, low to high</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="outline" size="icon" aria-label="Previous assignments" disabled={currentAssignmentPage === 0} onClick={() => setAssignmentPage(currentAssignmentPage - 1)}><ChevronLeft className="size-4" /></Button>
                        <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">{currentAssignmentPage + 1} / {assignmentPageCount}</span>
                        <Button variant="outline" size="icon" aria-label="Next assignments" disabled={currentAssignmentPage >= assignmentPageCount - 1} onClick={() => setAssignmentPage(currentAssignmentPage + 1)}><ChevronRight className="size-4" /></Button>
                      </div>
                    </div>
                    <div className="max-h-[68vh] overflow-auto">

                     <table className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
                       <thead className="sticky top-0 z-20 border-b border-border/60 bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                            {isStaff && (
                              <th
                                className="sticky left-0 z-30 w-[26%] border-r border-border/60 bg-muted/50 px-4 py-3 text-left font-semibold"
                                aria-sort={gradebookSort.endsWith("desc") ? "descending" : "ascending"}
                              >
                                <button
                                  type="button"
                                  onClick={() => setGradebookSort(gradebookSort === "last-asc" ? "last-desc" : "last-asc")}
                                  className="inline-flex items-center gap-1 uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                  aria-label={`Sort students by last name, currently ${gradebookSort === "last-desc" ? "Z to A" : "A to Z"}`}
                                >
                                  Student
                                  {gradebookSort === "last-desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
                                </button>
                              </th>
                            )}
                            <th className="w-[18%] border-r border-border/60 bg-muted/30 px-4 py-3 text-center font-semibold text-foreground">Current grade</th>
                            <th className="w-[10%] border-r border-border/60 px-3 py-3 text-center font-semibold">Missing</th>
                           {pageAssignments.map(({ assignment, average }) => {
                             const drafts = isStaff
                               ? grades.filter((g) => g.assignment_id === assignment.id && g.is_draft).length
                               : 0;
                             return (
                              <th key={assignment.id} className="border-r border-border/60 px-3 py-3 text-center font-semibold normal-case">
                               <span className="line-clamp-2 break-words text-foreground" title={assignment.title}>{assignment.title}</span>
                               <span className="mt-1 block font-normal tabular-nums text-muted-foreground">
                                 {Number(assignment.points_possible)} pts{average == null ? "" : ` · ${average.toFixed(1)}% avg`}
                               </span>
                               {isStaff && (courseworkUngraded[assignment.id] ?? 0) > 0 && (
                                 <button
                                   type="button"
                                   onClick={() => setClassTab("coursework")}
                                   className="mt-1 block w-full rounded-full border border-border bg-muted px-2 py-px text-[11px] font-medium text-foreground hover:border-primary/50"
                                   aria-label={`${courseworkUngraded[assignment.id]} submissions need grading for ${assignment.title}. Open Coursework`}
                                 >
                                   {courseworkUngraded[assignment.id]} need grading
                                 </button>
                               )}
                               {drafts > 0 && (
                                 <span className="mt-1 inline-block rounded-full border border-warning/50 bg-warning/15 px-2 py-px text-[11px] font-medium text-warning-foreground">
                                   {drafts} {drafts === 1 ? "draft" : "drafts"} not posted
                                 </span>
                               )}
                             </th>
                             );
                           })}
                        </tr>
                      </thead>
                       <tbody className="divide-y divide-border">
                         {visibleGradebookRoster.map((row, rowIndex) => {
                           const average = studentAverage(row.student_id);
                           const missingCount = gradebookRows.filter(({ assignment }) => missingFor(row.student_id, assignment)).length;
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
                                 {row.droppedAt && (
                                   <p className="mt-0.5 text-xs text-muted-foreground">Dropped {new Date(row.droppedAt).toLocaleDateString()}</p>
                                 )}
                                 {!useIds && row.students?.student_number && (
                                   <p className="mt-0.5 text-xs text-muted-foreground">ID {row.students.student_number}</p>
                                 )}
                               </td>}
                                <td className="border-r border-border/60 bg-muted/15 px-4 py-3 text-center">
                                 {average == null ? (
                                   <span className="text-muted-foreground">—</span>
                                 ) : (
                                    <div className="inline-flex flex-wrap items-center justify-center gap-1">
                                      <span className={`size-1.5 shrink-0 rounded-full ${average >= 80 ? "bg-success" : average >= 70 ? "bg-muted-foreground/60" : "bg-warning"}`} aria-hidden />
                                      <span className="font-semibold tabular-nums text-foreground">
                                       {average.toFixed(1)}%
                                     </span>
                                     <span className="text-xs font-semibold text-muted-foreground">{letterFor(average, setup.scale)}</span>
                                   </div>
                                 )}
                               </td>
                                <td className="border-r border-border/60 px-3 py-3 text-center">
                                 {missingCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground"><AlertCircle className="size-3.5 text-warning" />{missingCount}</span>
                                 ) : (
                                   <span className="text-muted-foreground">—</span>
                                 )}
                               </td>
                                {pageAssignments.map(({ assignment }) => {
                                  const grade = gradeFor(row.student_id, assignment.id);
                                  const markCode = markCodeFromComment(grade?.comment);
                                  const isDraft = Boolean(grade?.is_draft);
                                  return (
                                     <td key={assignment.id} className="border-r border-border/60 px-3 py-3 text-center tabular-nums" title={gradeCellTitle(assignment, grade, markCode, isStaff, timeZone)}>
                                      <span className="inline-flex items-center justify-center gap-1.5">
                                        {markCode ? (
                                           <Badge variant="outline" className={markCode === "M" ? "border-warning/50 bg-warning/10 text-foreground" : "border-border/70 bg-muted/40 text-muted-foreground"}>{markCode}</Badge>
                                        ) : grade?.points_earned == null ? (
                                          <span className="text-muted-foreground">—</span>
                                        ) : (
                                          <span className="font-medium text-foreground">{Number(grade.points_earned).toLocaleString()}</span>
                                        )}
                                        {isStaff && isDraft ? (
                                          <span
                                            className="rounded-full border border-warning/50 bg-warning/15 px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide text-warning-foreground"
                                            title="Draft grade — only you can see it until posted"
                                          >
                                            Draft
                                          </span>
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
                  {!showOverview && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                   <div className="flex flex-wrap gap-4">
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-success" />80%+ proficient</span>
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-muted-foreground/60" />70–79% approaching</span>
                     <span><span className="mr-1.5 inline-block size-2 rounded-full bg-warning" />Below 70% needs support</span>
                   </div>
                   {isStaff && <span>Click a student name for the full report.</span>}
                 </footer>}
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
                student={gradebookRoster.find((row) => row.student_id === gradebookReportStudentId)?.students ?? null}
                assignments={assignments}
                grades={grades.filter((g) => !g.is_draft)}
               setup={setup}
               displayName={studentLabel(gradebookRoster.find((row) => row.student_id === gradebookReportStudentId)?.students, useIds)}
               enrolledAt={enrolledAtFor(gradebookReportStudentId ?? "")}
               droppedAt={gradebookEnrollmentFor(gradebookReportStudentId ?? "")?.droppedAt ?? null}
             />
           )}
          {!isStaff && <FeedbackInbox classId={classId} />}
        </TabsContent>

        <TabsContent value="coursework">
          <Tabs defaultValue="assignments" className="mt-2">
            <TabsList className="h-auto bg-transparent p-0 gap-1">
              <TabsTrigger value="assignments" className={UNDERLINE_TAB}>
                Assignments ({assignments.length})
              </TabsTrigger>
              <TabsTrigger value="online" className={UNDERLINE_TAB}>
                Online quizzes &amp; essays
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assignments">
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
                missingCounts={courseworkMissing}
                ungradedCounts={courseworkUngraded}
                attentionRequest={isStaff ? courseworkAttention : null}
              />
            </TabsContent>
            <TabsContent value="online">
              <AssessmentsTab
                classId={classId}
                isStaff={isStaff}
                assignments={assignments}
                categories={assignmentCategories}
                gradeLevel={klass?.grade_level ?? null}
                timeZone={timeZone}
              />
            </TabsContent>
          </Tabs>
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
            timeZone={timeZone}
            desktopReview={isStaff}
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

        <TabsContent value="calendar" className="mt-4">
          <SchoolCalendar classId={classId} />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <FileLibrary
            desktopReview={isStaff}
            classId={classId}
            emptyLabel="No class files yet. Upload handouts, slides, spreadsheets or video."
          />
        </TabsContent>




      </Tabs>
      </div>
    </AppShell>
    </StudentPreviewContext.Provider>
  );
}

/** Staff-only "History" popover: who changed a cell's score/feedback, and when. */
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
          "id, old_score, new_score, old_feedback, new_feedback, reason, changed_at, changed_by",
        )
        .eq("assignment_id", assignmentId)
        .eq("student_id", studentId)
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const ids = [...new Set(data.map((c) => c.changed_by).filter((v): v is string => !!v))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name ?? "Staff member"]));
      }
      return data.map((c) => ({ ...c, by: c.changed_by ? names[c.changed_by] ?? "Staff member" : "System" }));
    },
  });

  const fmt = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));

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
        <p className="text-xs text-muted-foreground">Who changed this score and when.</p>
        {changes.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No changes recorded yet.
          </p>
        ) : (
          <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto border-l border-border pl-3">
            {changes.map((change) => (
              <li key={change.id} className="relative text-xs">
                <span className="absolute -left-[17px] top-1 size-2 rounded-full bg-muted-foreground/50" aria-hidden />
                <p className="font-medium tabular-nums text-foreground">
                  {fmt(change.old_score)} → {fmt(change.new_score)} pts
                </p>
                <p className="text-muted-foreground">
                  {change.by} · {new Date(change.changed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {change.new_feedback && change.new_feedback !== change.old_feedback ? (
                  <p className="mt-0.5 break-words text-muted-foreground">
                    Feedback: “{change.new_feedback}”
                  </p>
                ) : null}
                {change.reason ? (
                  <p className="mt-0.5 text-muted-foreground">Reason: {change.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
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
  late_penalty_enabled?: boolean | null;
  late_penalty_mode?: string | null;
  late_penalty_per_day?: number | null;
  late_penalty_zero_after_days?: number | null;
};

type TimelineKey = "current" | "upcoming" | "past" | "all";
type QuickKey = "ungraded" | "missing" | "draft" | "attention";
const TIMELINE: Array<[TimelineKey, string]> = [
  ["current", "Current"],
  ["upcoming", "Upcoming"],
  ["past", "Past / Graded"],
  ["all", "All"],
];
const QUICK: Array<[Exclude<QuickKey, "attention">, string]> = [
  ["ungraded", "Ungraded"],
  ["missing", "Missing"],
  ["draft", "Draft"],
];

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
  missingCounts,
  ungradedCounts,
  attentionRequest,
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
  missingCounts: Record<string, number>;
  ungradedCounts: Record<string, number>;
  attentionRequest: { key: QuickKey; request: number } | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [timeline, setTimeline] = useState<TimelineKey>("current");
  const [quick, setQuick] = useState<QuickKey | null>(attentionRequest?.key ?? null);
  useEffect(() => {
    if (!isStaff || !attentionRequest) return;
    setQuick(attentionRequest.key);
    setTimeline("all");
    setAssignmentSearch("");
  }, [attentionRequest, isStaff]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const draftKey = `new-assignment:${classId}`;
  const blank = {
    title: "",
    category: categories[0] ?? "Homework",
    points: "100",
    due: "",
    description: "",
    mode: "collected",
    rubricId: "",
    ...LATE_PENALTY_BLANK,
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
    .filter((r) => r.students)
    .map((r) => ({
      id: r.student_id,
      first_name: r.students!.first_name,
      last_name: r.students!.last_name,
      is_tester: isTestStudent(r.students),
      created_at: r.created_at ?? null,
      droppedAt: r.droppedAt ?? null,
    }));

  const today = todayKey();
  const draftGradeCount = (id: string) =>
    grades.filter((g) => g.assignment_id === id && g.is_draft).length;
  const bucketOf = (a: AssignmentRow) =>
    courseworkBucket(
      a.due_date,
      today,
      isStaff && ((ungradedCounts[a.id] ?? 0) > 0 || draftGradeCount(a.id) > 0),
    );
  const matchesQuick = (a: AssignmentRow, key: QuickKey) =>
    key === "attention"
      ? needsCourseworkAttention(ungradedCounts[a.id] ?? 0, draftGradeCount(a.id))
      : key === "ungraded"
      ? (ungradedCounts[a.id] ?? 0) > 0
      : key === "missing"
        ? (missingCounts[a.id] ?? 0) > 0
        : a.status === "draft";

  const searched = useMemo(() => {
    const needle = assignmentSearch.trim().toLocaleLowerCase();
    return assignments.filter(
      (assignment) =>
        !needle ||
        assignment.title.toLocaleLowerCase().includes(needle) ||
        assignment.category.toLocaleLowerCase().includes(needle),
    );
  }, [assignmentSearch, assignments]);

  const timelineCounts = {
    current: searched.filter((a) => bucketOf(a) === "current").length,
    upcoming: searched.filter((a) => bucketOf(a) === "upcoming").length,
    past: searched.filter((a) => bucketOf(a) === "past").length,
    all: searched.length,
  };
  const inTimeline = searched.filter((a) => timeline === "all" || bucketOf(a) === timeline);
  const quickCounts = {
    ungraded: inTimeline.filter((a) => matchesQuick(a, "ungraded")).length,
    missing: inTimeline.filter((a) => matchesQuick(a, "missing")).length,
    draft: inTimeline.filter((a) => matchesQuick(a, "draft")).length,
  };

  const visibleAssignments = inTimeline
    .filter((a) => !quick || matchesQuick(a, quick))
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return a.title.localeCompare(b.title);
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return b.due_date.localeCompare(a.due_date) || a.title.localeCompare(b.title);
    });

  const groups = Object.entries(
    visibleAssignments.reduce<Record<string, AssignmentRow[]>>((acc, a) => {
      (acc[a.category] ??= []).push(a);
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => {
      const currentCount = items.filter((a) => bucketOf(a) === "current").length;
      return {
        category,
        items,
        currentCount,
        // Auto-open only categories with current work, unless a filter/search narrows the list.
        autoOpen: timeline !== "current" || !!quick || !!assignmentSearch.trim() || currentCount > 0,
      };
    });

  const dueSoonCount = assignments.filter(
    (a) => (isStaff || a.status !== "draft") && isDueSoon(a.due_date, today),
  ).length;
  const attentionCount = assignments.filter((a) =>
    isStaff
      ? needsCourseworkAttention(ungradedCounts[a.id] ?? 0, draftGradeCount(a.id))
      : (missingCounts[a.id] ?? 0) > 0,
  ).length;

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
        ...latePenaltyColumns(form),
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

  const gradeAlert = useServerFn(notifyGradesPosted);
  const postDrafts = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("grades")
        .update({ is_draft: false, posted_at: new Date().toISOString(), posted_by: auth.user?.id ?? null })
        .eq("assignment_id", assignmentId)
        .eq("is_draft", true)
        .select("student_id");
      if (error) throw error;
      const ids = (data ?? []).map((g) => g.student_id);
      if (ids.length) void gradeAlert({ data: { assignmentId, studentIds: ids } }).catch(() => {});
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
              <LatePenaltyFields
                idPrefix="new-penalty"
                value={{ ...LATE_PENALTY_BLANK, ...form }}
                onChange={(p) => setForm({ ...form, ...p })}
              />
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
      <PublishNotifyDialog
        open={!!publishTarget}
        onOpenChange={(o) => !o && setPublishTarget(null)}
        title={publishTarget?.title ?? ""}
        pending={publishAssignment.isPending}
        onConfirm={(v) => publishTarget && publishAssignment.mutate({ id: publishTarget.id, notify: v })}
      />

      {assignments.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setTimeline("current"); setQuick(null); }}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
          >
            <Clock className="size-4 text-primary" />
            <span className="text-sm">
              <span className="font-semibold">Due soon:</span>{" "}
              {dueSoonCount === 0
                ? "nothing due in the next 7 days"
                : `${dueSoonCount} ${dueSoonCount === 1 ? "item" : "items"} due in the next 7 days`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setTimeline("all"); setQuick(isStaff ? "attention" : "missing"); }}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-warning/60"
          >
            <ClipboardList className={`size-4 ${attentionCount > 0 ? "text-warning" : "text-muted-foreground"}`} />
            <span className="text-sm">
              <span className="font-semibold">Needs attention:</span>{" "}
              {attentionCount === 0
                ? "all caught up"
                : isStaff
                  ? `${attentionCount} ${attentionCount === 1 ? "item has" : "items have"} work to grade or draft grades to post`
                  : `${attentionCount} missing ${attentionCount === 1 ? "item" : "items"}`}
            </span>
          </button>
        </div>
      ) : null}

      <section className="coursework-ledger mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-panel)]">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <div className="min-w-0">
            <header className="border-b border-border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-1 border-b border-border" role="group" aria-label="Coursework timeline">
                {TIMELINE.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={timeline === key}
                    onClick={() => setTimeline(key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                      timeline === key
                        ? "border-primary font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label} <span className="text-xs opacity-70">({timelineCounts[key]})</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                {QUICK.filter(([key]) => isStaff || key === "missing").map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={quick === key ? "secondary" : "ghost"}
                    aria-pressed={quick === key}
                    onClick={() => setQuick(quick === key ? null : key)}
                  >
                    {label} <span className="ml-1 text-xs opacity-70">{quickCounts[key]}</span>
                  </Button>
                ))}
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(Object.fromEntries(groups.map((g) => [g.category, true])))}>
                    Expand all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(Object.fromEntries(groups.map((g) => [g.category, false])))}>
                    Collapse all
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {visibleAssignments.length} of {assignments.length} shown · newest due dates first
              </p>
              {quick === "attention" ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Needs attention · work to grade or draft grades to post</span>
                  <Button size="sm" variant="ghost" onClick={() => setQuick(null)}>Clear filter</Button>
                </div>
              ) : null}
            </header>

            {visibleAssignments.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nothing here. Try another tab or clear a filter.
              </p>
            ) : (
              groups.map((group) => {
                const isOpen = expanded[group.category] ?? group.autoOpen;
                return (
                  <div key={group.category} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded((prev) => ({ ...prev, [group.category]: !isOpen }))}
                      className="flex w-full items-center justify-between gap-3 bg-secondary/30 px-4 py-2.5 text-left hover:bg-secondary/50"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {group.category}
                        <Badge variant="outline" className="font-normal">{group.items.length}</Badge>
                      </span>
                      {!isOpen && group.currentCount === 0 ? (
                        <span className="text-xs text-muted-foreground">No current items</span>
                      ) : null}
                    </button>
                    {isOpen ? (
                      <div className="space-y-2 bg-secondary/15 p-3 sm:p-4">
                  {group.items.map((a) => {
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
                                  variant="ghost"
                                  className="text-muted-foreground"
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
                                <details className="group/more relative">
                                  <summary
                                    className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden"
                                    aria-label={`More actions for ${a.title}`}
                                    title="More actions"
                                  >
                                    <MoreVertical className="size-4" />
                                  </summary>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 xl:justify-end">
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
                                  </div>
                                </details>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
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
    ...latePenaltyFormFrom(assignment),
  });
  const [form, setForm] = useState(initial);
  const [reopen, setReopen] = useState<ReopenSettings>(REOPEN_DEFAULTS);
  const reopenWork = useServerFn(reopenCoursework);
  const copyWork = useServerFn(copyResourceToClasses);
  const { user, isAdmin } = useAuth();
  const [addTo, setAddTo] = useState<string[]>([]);
  const { data: otherClasses = [] } = useQuery({
    queryKey: ["edit-assignment-classes", user?.id, isAdmin, classId],
    enabled: open && !!user,
    queryFn: async () => {
      const [{ data, error }, { data: co }] = await Promise.all([
        supabase.from("classes").select("id, name, period, teacher_id, teacher_name").order("name"),
        supabase.from("class_co_teachers").select("class_id, permission_level").eq("teacher_id", user!.id),
      ]);
      if (error) throw error;
      const coIds = new Set((co ?? []).filter((r) => r.permission_level !== "view_only").map((r) => r.class_id));
      return (data ?? []).filter(
        (c) => c.id !== classId && (isAdmin || c.teacher_id === user!.id || coIds.has(c.id)),
      );
    },
  });

  function openChange(next: boolean) {
    if (next) {
      setForm(initial());
      setReopen(REOPEN_DEFAULTS);
      setAddTo([]);
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
          ...latePenaltyColumns(form),
        })
        .eq("id", assignment.id);
      if (error) throw error;

      let copied = 0;
      if (addTo.length > 0) {
        const r = await copyWork({
          data: { kind: "assignment", id: assignment.id, classIds: addTo, keepDueDate: true },
        });
        copied = r.copied;
      }

      // Pushing the due date later automatically gives students another chance.
      const wasDue = assignment.due_date ?? "";
      const movedLater = Boolean(form.due) && (!wasDue || form.due > wasDue);
      if (movedLater) {
        const r = await reopenWork({
          data: { assignmentId: assignment.id, scope: reopen.scope, notify: reopen.notify },
        });
        return { ...r, copied };
      }
      return { reopened: 0, copied };
    },
    onSuccess: (result) => {
      const extra = result.copied > 0 ? ` and added to ${result.copied} more class${result.copied === 1 ? "" : "es"}` : "";
      toast.success(
        result.reopened > 0
          ? `Assignment updated${extra} — reopened for ${result.reopened} student${result.reopened === 1 ? "" : "s"}`
          : `Assignment updated${extra}`,
      );
      setAddTo([]);
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
          <LatePenaltyFields
            idPrefix={`e-penalty-${assignment.id}`}
            value={form}
            onChange={(p) => setForm({ ...form, ...p })}
          />
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
          {otherClasses.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Also add to other classes</p>
              <p className="text-xs text-muted-foreground">
                Forgot a class? Tick it here — each class gets its own copy with these details and due date.
              </p>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {otherClasses.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`e-add-${assignment.id}-${c.id}`}
                      checked={addTo.includes(c.id)}
                      onCheckedChange={() =>
                        setAddTo((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))
                      }
                    />
                    <Label htmlFor={`e-add-${assignment.id}-${c.id}`} className="text-sm font-normal">
                      {c.name}
                      <span className="text-muted-foreground">
                        {c.period ? ` · Period ${c.period}` : ""}
                        {c.teacher_id !== user?.id && c.teacher_name ? ` · ${c.teacher_name}` : ""}
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
  created_at?: string | null;
  droppedAt?: string | null;
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
              variant={groupBy === g ? "secondary" : "outline"}
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
        enrolledAt={(roster.find((r) => r.student_id === reportStudentId) as { created_at?: string | null } | undefined)?.created_at ?? null}
      />
    </div>
  );
}

/** Hover summary for a Gradebook cell: points, then when it was posted (or that it is a draft). */
function gradeCellTitle(
  assignment: { title: string; points_possible: number | string | null } & LatePenaltySettings,
  grade: { points_earned: number | string | null; is_draft?: boolean | null; posted_at?: string | null; updated_at?: string | null } | undefined,
  markCode: string | null | undefined,
  isStaff: boolean,
  timeZone?: string,
) {
  const possible = Number(assignment.points_possible ?? 0);
  if (!grade) return `${assignment.title} — not scored yet`;
  const penalty = markCode?.toUpperCase() === "M" && isStaff ? missingMarkValue(assignment, new Date(), timeZone) : null;
  const score = markCode
    ? penalty ? `Missing · ${penalty.explanation}` : `Mark ${markCode}`
    : grade.points_earned == null
      ? "Not scored yet"
      : `${Number(grade.points_earned).toLocaleString()} / ${possible.toLocaleString()} points`;
  const when = grade.is_draft
    ? isStaff ? "Draft — not posted yet" : ""
    : grade.posted_at ?? grade.updated_at
      ? `Posted ${formatDate(grade.posted_at ?? grade.updated_at)}`
      : "";
  return [assignment.title, score, when].filter(Boolean).join(" · ");
}
