import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { LoadError } from "@/components/LoadError";
import { NotebookEmpty, NotebookLoading } from "@/components/NotebookDecorations";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, fetchByIds } from "@/lib/query";
import { READ_REUSE_MS } from "@/lib/api-query-policy";
import { studentStatusLabel, tryNormalizeStudentNumber, type StudentStatus } from "@/lib/student-ids";
import { studentIdText } from "@/lib/student-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClassLogins } from "@/components/students/ClassLogins";
import { StudentImport } from "@/components/students/StudentImport";
import { CreateLogins } from "@/components/students/CreateLogins";
import { CreateAccount } from "@/components/students/CreateAccount";
import { UnlinkedAccounts } from "@/components/students/UnlinkedAccounts";
import { StudentProfile, type StudentRow } from "@/components/students/StudentProfile";
import { StudentExitDialog } from "@/components/students/StudentExitDialog";
import { graduatingClassLabel } from "@/lib/academic";
import { useAuth } from "@/hooks/useAuth";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";
import { ChevronDown, Plus, Search } from "lucide-react";

type DirectoryStatus = StudentStatus | "all";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "Students — Meraki Education" },
      { name: "description", content: "Student directory with grade level and guardian contact." },
      { property: "og:title", content: "Students — Meraki Education" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Student directory with grade level and guardian contact.",
      },
    ],
  }),
  component: StudentsPage,
});

function StudentsPage() {
  const queryClient = useQueryClient();
  const { isStaff, isAdmin, teacherMode, user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profileStudent, setProfileStudent] = useState<StudentRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<DirectoryStatus>("active");
  const [exitIds, setExitIds] = useState<string[] | null>(null);
  const [sortMode, setSortMode] = useStudentSort("students-directory");

  const [form, setForm] = useState({
    first: "",
    last: "",
    grade: "7",
    guardianEmail: "",
  });

  // While working as a teacher, the directory is limited to students enrolled in
  // this person's own classes.
  const scopeQuery = useQuery({
    queryKey: ["my-class-student-ids", user?.id, teacherMode, profile?.full_name],
    enabled: !!user && teacherMode,
    queryFn: async () => {
      const myName = (profile?.full_name ?? "").trim().toLowerCase();
      const classRows = await fetchAll((from, to) =>
        supabase.from("classes").select("id, teacher_id, teacher_name").order("id").range(from, to),
      );
      const mine = classRows
        .filter(
          (c) =>
            c.teacher_id === user!.id ||
            (!!myName && (c.teacher_name ?? "").trim().toLowerCase() === myName),
        )
        .map((c) => c.id);
      if (mine.length === 0) return new Set<string>();
      const rows = await fetchByIds(mine, (ids, from, to) =>
        supabase.from("enrollments").select("student_id").in("class_id", ids).order("id").range(from, to),
      );
      return new Set(rows.map((r) => r.student_id));
    },
  });

  const studentsQuery = useQuery({
    queryKey: ["students", "directory", user?.id, teacherMode],
    staleTime: READ_REUSE_MS,
    queryFn: () =>
      fetchAll((from, to) =>
        supabase
          .from("students")
          .select(
            "id, first_name, last_name, grade_level, guardian_email, student_number, student_status, chinese_name, user_id, guardian_user_id",
          )
          .order("last_name")
          .order("id")
          .range(from, to),
      ),
  });
  const allStudents = studentsQuery.data ?? [];
  const myStudentIds = scopeQuery.data;

  const create = useMutation({
    mutationFn: async () => {
      if (form.first.trim().length < 2 || form.last.trim().length < 2)
        throw new Error("Enter first and last name");
      const grade = Number(form.grade);
      if (Number.isNaN(grade) || grade < 1 || grade > 12) throw new Error("Grade must be 1–12");
      const email = form.guardianEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Guardian email looks invalid");
      const { data, error } = await supabase
        .from("students")
        .insert({
          first_name: form.first.trim().slice(0, 60),
          last_name: form.last.trim().slice(0, 60),
          grade_level: grade,
          guardian_email: email.slice(0, 255) || null,
        })
        .select("student_number")
        .single();
      if (error) throw error;
      return data?.student_number ?? null;
    },
    onSuccess: (studentNumber) => {
      toast.success(
        studentNumber ? `Student added. Student ID ${studentNumber}` : "Student added",
      );
      setOpen(false);
      setForm({ first: "", last: "", grade: "7", guardianEmail: "" });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["class-roster"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scopeFailed = teacherMode && scopeQuery.isError;
  const scopeLoading = teacherMode && scopeQuery.isPending;
  const idQuery = tryNormalizeStudentNumber(query);
  const students = allStudents.filter((s) => {
    const exactId = !!idQuery && tryNormalizeStudentNumber(s.student_number) === idQuery;
    if (teacherMode && myStudentIds && !myStudentIds.has(s.id) && !exactId) return false;
    if (teacherMode && !myStudentIds && !exactId) return false;
    return true;
  });

  const filtered = sortStudents(
    students.filter((s) => {
      const exactId = !!idQuery && tryNormalizeStudentNumber(s.student_number) === idQuery;
      if (exactId) return true;
      const hay = `${s.first_name} ${s.last_name} ${s.chinese_name ?? ""} ${s.student_number ?? ""}`.toLowerCase();
      const q = query.trim().toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (statusFilter === "all") return true;
      return (s.student_status ?? "active") === statusFilter;
    }),
    sortMode,
  );

  const grades = Array.from(new Set(filtered.map((s) => s.grade_level))).sort((a, b) => a - b);
  const groups = grades.map((grade) => ({
    grade,
    students: filtered.filter((s) => s.grade_level === grade),
  }));

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.includes(s.id));
  const toggleAll = () =>
    setSelected(allSelected ? [] : filtered.map((s) => s.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));


  return (
    <AppShell
      desktopReview
      title="Students"
      description={teacherMode ? "Your class directory" : "School directory"}
      actions={
        <div className="flex flex-wrap gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4" />Add student</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add student</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first">First name</Label>
                  <Input
                    id="first"
                    value={form.first}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, first: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last">Last name</Label>
                  <Input
                    id="last"
                    value={form.last}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, last: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grade">Grade level</Label>
                <Input
                  id="grade"
                  inputMode="numeric"
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                A student ID is issued automatically and stays with this student. It cannot be edited later.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="guardianEmail">Guardian email</Label>
                <Input
                  id="guardianEmail"
                  type="email"
                  value={form.guardianEmail}
                  maxLength={255}
                  onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Add student"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          aria-label="Search students"
          aria-describedby="directory-search-hint"
          placeholder="Search by name or full student ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
        <p id="directory-search-hint" className="sr-only">
          A full student ID also finds withdrawn, transferred, graduated, and no-show students.
        </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="directory-status">Show</Label>
          <select
            id="directory-status"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as DirectoryStatus)}
          >
            <option value="active">Active students</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="transferred_out">Transferred out</option>
            <option value="graduated">Graduated</option>
            <option value="no_show">No-show</option>
            <option value="all">All records</option>
          </select>
        </div>
        <StudentSortControl value={sortMode} onChange={setSortMode} />
        <span className="text-sm text-muted-foreground">{studentsQuery.isError || scopeFailed ? "Students couldn't be loaded." : scopeLoading || studentsQuery.isPending ? "Loading students…" : `${filtered.length} ${filtered.length === 1 ? "student" : "students"}`}</span>
      </div>
      <details className="group border-b border-border py-3">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />Directory tools
        </summary>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <StudentImport />
          {isAdmin ? <ClassLogins /> : null}
          {isAdmin ? <CreateAccount /> : null}
        </div>
      </details>
      <div className="flex min-h-12 flex-wrap items-center gap-2 py-2" aria-live="polite">
        {isStaff && selected.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" onClick={() => setExitIds(selected)}>
              Withdraw selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </>
        ) : null}
      </div>
      <div>
        <div className="overflow-x-auto"><table className="w-full min-w-[40rem] table-fixed text-sm">
          <colgroup>
            {isStaff ? <col className="w-[5%]" /> : null}
            <col className={isStaff ? "w-[24%]" : "w-[34%]"} />
            <col className="w-[18%]" />
            {isStaff ? <col className="w-[18%]" /> : null}
            <col className={isStaff ? "w-[22%]" : "w-[48%]"} />
            {isStaff ? <col className="w-[13%]" /> : null}
          </colgroup>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              {isStaff ? (
                <th className="px-2 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all students"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Year group</th>
              {isStaff ? <th className="px-4 py-3">Student ID</th> : null}
              <th className="px-4 py-3">Accounts &amp; guardian</th>
              {isStaff ? <th className="px-2 py-3"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {studentsQuery.isError || scopeFailed ? (
              <tr>
                <td colSpan={isStaff ? 6 : 3} className="px-4 py-6">
                  <LoadError
                    label="Students couldn't be loaded. The directory stays hidden so a failed read is not treated as an empty school."
                    onRetry={() => {
                      void studentsQuery.refetch();
                      void scopeQuery.refetch();
                    }}
                  />
                </td>
              </tr>
            ) : scopeLoading || studentsQuery.isPending ? (
              <tr>
                <td colSpan={isStaff ? 6 : 3} className="px-4 py-6">
                  <NotebookLoading className="text-sm text-muted-foreground">Loading students…</NotebookLoading>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={isStaff ? 6 : 3} className="px-4 py-6 text-muted-foreground">
                  <NotebookEmpty>No students found.</NotebookEmpty>
                </td>
              </tr>
            ) : (
              groups.flatMap((group) => [
                <tr key={`grade-${group.grade}`} className="bg-secondary/30">
                  <td
                    colSpan={isStaff ? 6 : 3}
                    className="px-4 py-2 text-xs font-medium text-muted-foreground"
                  >
                    Grade {group.grade} · {group.students.length}{" "}
                    {group.students.length === 1 ? "student" : "students"}
                  </td>
                </tr>,
                ...group.students.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer hover:bg-secondary/40"
                  onClick={() => setProfileStudent(s)}
                >
                  {isStaff ? (
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.first_name} ${s.last_name}`}
                        checked={selected.includes(s.id)}
                        onChange={() => toggleOne(s.id)}
                      />
                    </td>
                  ) : null}
                  <td className="break-words px-4 py-3 font-medium">
                    <Button variant="ghost" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left hover:bg-transparent" onClick={(e) => { e.stopPropagation(); setProfileStudent(s); }}>
                    {s.last_name}, {s.first_name}
                    </Button>
                    {s.chinese_name ? (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">{s.chinese_name}</span>
                    ) : null}
                    {s.student_status && s.student_status !== "active" ? (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {studentStatusLabel(s.student_status)}
                      </span>
                    ) : null}
                  </td>
                  <td className="break-words px-4 py-3">Grade {s.grade_level}<span className="mt-1 block text-xs text-muted-foreground">{graduatingClassLabel(s.grade_level)}</span></td>
                  {isStaff ? (
                    <td className="px-4 py-3 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      {s.student_number ? (
                        <>
                          <span className="sr-only">{studentIdText(s)}</span>
                          <span aria-hidden>{s.student_number}</span>
                        </>
                      ) : (
                        "No ID"
                      )}
                    </td>
                  ) : null}
                  <td className="break-words px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {s.user_id ? "Student ✓" : "No student login"}
                        {" · "}
                        {s.guardian_user_id ? "Guardian ✓" : "No guardian login"}
                      </span>
                      <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.guardian_email ?? "No guardian email"}</span>
                      {isAdmin ? <CreateLogins student={s} /> : null}
                    </div>
                  </td>
                  {isStaff ? (
                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Withdraw ${s.first_name} ${s.last_name}`}
                        onClick={() => setExitIds([s.id])}
                      >
                        Withdraw
                      </Button>
                    </td>
                  ) : null}
                </tr>
                )),
              ])
            )}
          </tbody>
        </table></div>
      </div>
      {isStaff ? <UnlinkedAccounts students={students} /> : null}
      <StudentProfile
        student={profileStudent}
        open={!!profileStudent}
        onOpenChange={(o) => {
          if (!o) setProfileStudent(null);
        }}
        onStudentChange={setProfileStudent}
      />
      <StudentExitDialog
        students={allStudents.filter((student) => exitIds?.includes(student.id))}
        open={!!exitIds}
        onOpenChange={(open) => {
          if (!open) setExitIds(null);
        }}
        onComplete={() => {
          setExitIds(null);
          setSelected([]);
        }}
      />
    </AppShell>
  );
}
