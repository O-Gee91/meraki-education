import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
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
import { graduatingClassLabel } from "@/lib/academic";
import { useAuth } from "@/hooks/useAuth";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "Students — Meraki Education" },
      { name: "description", content: "Student directory with grade level and guardian contact." },
      { property: "og:title", content: "Students — Meraki Education" },
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
  const [sortMode, setSortMode] = useStudentSort("students-directory");

  const [form, setForm] = useState({
    first: "",
    last: "",
    grade: "7",
    guardianEmail: "",
    studentNumber: "",
  });

  // While working as a teacher, the directory is limited to students enrolled in
  // this person's own classes.
  const { data: myStudentIds } = useQuery({
    queryKey: ["my-class-student-ids", user?.id, teacherMode],
    enabled: !!user && teacherMode,
    queryFn: async () => {
      const myName = (profile?.full_name ?? "").trim().toLowerCase();
      const { data: classRows, error: classError } = await supabase
        .from("classes")
        .select("id, teacher_id, teacher_name");
      if (classError) throw classError;
      const mine = (classRows ?? [])
        .filter(
          (c) =>
            c.teacher_id === user!.id ||
            (!!myName && (c.teacher_name ?? "").trim().toLowerCase() === myName),
        )
        .map((c) => c.id);
      if (mine.length === 0) return new Set<string>();
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id")
        .in("class_id", mine);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.student_id));
    },
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, first_name, last_name, grade_level, guardian_email, student_number, chinese_name, user_id, guardian_user_id",
        )
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (form.first.trim().length < 2 || form.last.trim().length < 2)
        throw new Error("Enter first and last name");
      const grade = Number(form.grade);
      if (Number.isNaN(grade) || grade < 1 || grade > 12) throw new Error("Grade must be 1–12");
      const email = form.guardianEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Guardian email looks invalid");
      const { error } = await supabase.from("students").insert({
        first_name: form.first.trim().slice(0, 60),
        last_name: form.last.trim().slice(0, 60),
        grade_level: grade,
        guardian_email: email.slice(0, 255) || null,
        student_number: form.studentNumber.trim().slice(0, 20) || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added");
      setOpen(false);
      setForm({ first: "", last: "", grade: "7", guardianEmail: "", studentNumber: "" });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNumber = useMutation({
    mutationFn: async (input: { id: string; value: string }) => {
      const value = input.value.trim().slice(0, 20);
      const { error } = await supabase
        .from("students")
        .update({ student_number: value || null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student ID saved");
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStudents = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Select at least one student");
      const { error } = await supabase.from("students").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(ids.length === 1 ? "Student removed" : `${ids.length} students removed`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmRemove = (ids: string[]) => {
    const label =
      ids.length === 1
        ? "Remove this student from the school directory? Their records will be deleted."
        : `Remove ${ids.length} students from the school directory? Their records will be deleted.`;
    if (window.confirm(label)) removeStudents.mutate(ids);
  };

  const students =
    teacherMode && myStudentIds ? allStudents.filter((s) => myStudentIds.has(s.id)) : allStudents;

  const filtered = sortStudents(
    students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.chinese_name ?? ""} ${s.student_number ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
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
      title="Students"
      description="The school directory used across gradebook, attendance and reporting."
      actions={
        <div className="flex flex-wrap gap-2">
          {isAdmin ? <ClassLogins /> : null}
          {isAdmin ? <CreateAccount /> : null}
          <StudentImport />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add student</Button>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grade">Grade level</Label>
                  <Input
                    id="grade"
                    inputMode="numeric"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="studentNumber">Student ID</Label>
                  <Input
                    id="studentNumber"
                    value={form.studentNumber}
                    maxLength={20}
                    onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
                  />
                </div>
              </div>
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name or student ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <StudentSortControl value={sortMode} onChange={setSortMode} />
        {isStaff && selected.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeStudents.isPending}
              onClick={() => confirmRemove(selected)}
            >
              Remove selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </>
        ) : null}
      </div>
      {isAdmin ? <UnlinkedAccounts students={students} /> : null}
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {isStaff ? (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all students"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Graduating class</th>
              <th className="px-4 py-3">Student ID</th>
              <th className="px-4 py-3">Guardian email</th>
              <th className="px-4 py-3">Accounts</th>
              {isStaff ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isStaff ? 8 : 6} className="px-4 py-6 text-muted-foreground">
                  No students found.
                </td>
              </tr>
            ) : (
              groups.flatMap((group) => [
                <tr key={`grade-${group.grade}`} className="bg-secondary/60">
                  <td
                    colSpan={isStaff ? 8 : 6}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.first_name} ${s.last_name}`}
                        checked={selected.includes(s.id)}
                        onChange={() => toggleOne(s.id)}
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3 font-medium">
                    {s.last_name}, {s.first_name}
                    {s.chinese_name ? (
                      <span className="ml-2 text-muted-foreground">{s.chinese_name}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{s.grade_level}</td>
                  <td className="px-4 py-3">{graduatingClassLabel(s.grade_level)}</td>
                  <td
                    className="px-4 py-3 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isStaff ? (
                      <Input
                        key={s.student_number ?? ""}
                        className="h-8 w-28"
                        placeholder="Add ID"
                        maxLength={20}
                        defaultValue={s.student_number ?? ""}
                        onBlur={(e) => {
                          if (e.target.value.trim() === (s.student_number ?? "")) return;
                          saveNumber.mutate({ id: s.id, value: e.target.value });
                        }}
                      />
                    ) : (
                      (s.student_number ?? "—")
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.guardian_email ?? "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {s.user_id ? "Student ✓" : "No student login"}
                        {" · "}
                        {s.guardian_user_id ? "Guardian ✓" : "No guardian login"}
                      </span>
                      {isAdmin ? <CreateLogins student={s} /> : null}
                    </div>
                  </td>
                  {isStaff ? (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={removeStudents.isPending}
                        onClick={() => confirmRemove([s.id])}
                      >
                        Remove
                      </Button>
                    </td>
                  ) : null}
                </tr>
                )),
              ])
            )}
          </tbody>
        </table>
      </div>
      <StudentProfile
        student={profileStudent}
        open={!!profileStudent}
        onOpenChange={(o) => {
          if (!o) setProfileStudent(null);
        }}
      />
    </AppShell>
  );
}
