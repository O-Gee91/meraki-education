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
import { UnlinkedAccounts } from "@/components/students/UnlinkedAccounts";
import { StudentProfile, type StudentRow } from "@/components/students/StudentProfile";
import { graduatingClassLabel } from "@/lib/academic";
import { useAuth } from "@/hooks/useAuth";

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
  const { isStaff } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profileStudent, setProfileStudent] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({
    first: "",
    last: "",
    grade: "7",
    guardianEmail: "",
    studentNumber: "",
  });

  const { data: students = [] } = useQuery({
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

  const filtered = students.filter((s) =>
    `${s.first_name} ${s.last_name} ${s.chinese_name ?? ""} ${s.student_number ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <AppShell
      title="Students"
      description="The school directory used across gradebook, attendance and reporting."
      actions={
        <div className="flex flex-wrap gap-2">
          {isStaff ? <ClassLogins /> : null}
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
      <Input
        placeholder="Search by name or student ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      {isStaff ? <UnlinkedAccounts students={students} /> : null}
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Graduating class</th>
              <th className="px-4 py-3">Student ID</th>
              <th className="px-4 py-3">Guardian email</th>
              <th className="px-4 py-3">Accounts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  No students found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer hover:bg-secondary/40"
                  onClick={() => setProfileStudent(s)}
                >
                  <td className="px-4 py-3 font-medium">
                    {s.last_name}, {s.first_name}
                    {s.chinese_name ? (
                      <span className="ml-2 text-muted-foreground">{s.chinese_name}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{s.grade_level}</td>
                  <td className="px-4 py-3">{graduatingClassLabel(s.grade_level)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {s.user_id ? "Student ✓" : "No student login"}
                        {" · "}
                        {s.guardian_user_id ? "Guardian ✓" : "No guardian login"}
                      </span>
                      {isStaff ? <CreateLogins student={s} /> : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
