import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { graduatingClassLabel } from "@/lib/academic";
import { studentIdText } from "@/lib/student-display";
import {
  STUDENT_RECORD_QUERY_KEYS,
  STUDENT_STATUSES,
  studentStatusLabel,
  type StudentStatus,
} from "@/lib/student-ids";
import {
  correctStudentNumber,
  issueStudentNumber,
  setStudentStatus,
} from "@/lib/student-ids.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: number;
  guardian_email: string | null;
  student_number: string | null;
  student_status?: string | null;
  chinese_name: string | null;
  user_id: string | null;
  guardian_user_id: string | null;
};

function refreshStudentRecords(queryClient: ReturnType<typeof useQueryClient>) {
  for (const queryKey of STUDENT_RECORD_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

export function StudentProfile({
  student,
  open,
  onOpenChange,
  onStudentChange,
}: {
  student: StudentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStudentChange?: (student: StudentRow) => void;
}) {
  const queryClient = useQueryClient();
  const { isStaff, isAdmin } = useAuth();
  const issueNumber = useServerFn(issueStudentNumber);
  const correctNumber = useServerFn(correctStudentNumber);
  const changeStatus = useServerFn(setStudentStatus);
  const [editing, setEditing] = useState(false);
  const [showGuardian, setShowGuardian] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctValue, setCorrectValue] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [destroyText, setDestroyText] = useState("");
  const [statusChoice, setStatusChoice] = useState<StudentStatus>("active");
  const [form, setForm] = useState({
    first: "",
    last: "",
    chinese: "",
    grade: "",
    guardianEmail: "",
  });

  useEffect(() => {
    setEditing(false);
    setShowGuardian(false);
    setCorrectOpen(false);
    setCorrectValue("");
    setCorrectReason("");
    setDestroyText("");
    if (!student) return;
    const status = STUDENT_STATUSES.find((item) => item === student.student_status) ?? "active";
    setStatusChoice(status);
    setForm({
      first: student.first_name ?? "",
      last: student.last_name ?? "",
      chinese: student.chinese_name ?? "",
      grade: String(student.grade_level ?? ""),
      guardianEmail: student.guardian_email ?? "",
    });
  }, [student]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.first.trim().length < 1 || form.last.trim().length < 1)
        throw new Error("First and last name are required");
      const grade = Number(form.grade);
      if (Number.isNaN(grade) || grade < 1 || grade > 12) throw new Error("Grade must be 1–12");
      const email = form.guardianEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Guardian email looks invalid");
      const { error } = await supabase
        .from("students")
        .update({
          first_name: form.first.trim().slice(0, 60),
          last_name: form.last.trim().slice(0, 60),
          chinese_name: form.chinese.trim().slice(0, 60) || null,
          grade_level: grade,
          guardian_email: email.slice(0, 255) || null,
        })
        .eq("id", student!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student information updated");
      setEditing(false);
      if (student) {
        const next = {
          ...student,
          first_name: form.first.trim().slice(0, 60),
          last_name: form.last.trim().slice(0, 60),
          chinese_name: form.chinese.trim().slice(0, 60) || null,
          grade_level: Number(form.grade),
          guardian_email: form.guardianEmail.trim().slice(0, 255) || null,
        };
        onStudentChange?.(next);
      }
      refreshStudentRecords(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["student-profile-classes", student?.id],
    enabled: open && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("class_id, classes(name, subject, period, teacher_name)")
        .eq("student_id", student!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: logins } = useQuery({
    queryKey: ["student-profile-logins", student?.user_id],
    enabled: open && !!student?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_events")
        .select("id, signed_in_at")
        .eq("user_id", student!.user_id!)
        .order("signed_in_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const { data: guardianLogins } = useQuery({
    queryKey: ["student-profile-guardian-logins", student?.guardian_user_id],
    enabled: open && showGuardian && !!student?.guardian_user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_events")
        .select("id, signed_in_at")
        .eq("user_id", student!.guardian_user_id!)
        .order("signed_in_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: detentions = [] } = useQuery({
    queryKey: ["detentions", "student", student?.id, "profile"],
    enabled: open && !!student && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detentions")
        .select("id, reason, scheduled_date, status")
        .eq("student_id", student!.id)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!student) return null;

  const applyStudent = (patch: Partial<StudentRow>) => {
    const next = { ...student!, ...patch };
    onStudentChange?.(next);
    refreshStudentRecords(queryClient);
  };

  const issue = async () => {
    try {
      const result = await issueNumber({ data: { studentId: student!.id } });
      applyStudent({ student_number: result.studentNumber, student_status: student!.student_status ?? "active" });
      toast.success(`Student ID ${result.studentNumber}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue a student ID");
    }
  };

  const correct = async () => {
    try {
      const result = await correctNumber({
        data: { studentId: student!.id, newNumber: correctValue, reason: correctReason },
      });
      applyStudent({ student_number: result.studentNumber });
      setCorrectOpen(false);
      setCorrectValue("");
      setCorrectReason("");
      toast.success(`Student ID is now ${result.studentNumber}. The previous ID is retired.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not correct the student ID");
    }
  };

  const updateStatus = async () => {
    try {
      const result = await changeStatus({ data: { studentId: student!.id, status: statusChoice } });
      applyStudent({ student_status: result.status });
      toast.success(`Status is now ${studentStatusLabel(result.status)}. The student ID stays on file.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update status");
    }
  };

  const destroyConfirm = student.student_number?.trim() || "DELETE RECORD";
  const destroy = async () => {
    if (destroyText.trim() !== destroyConfirm) return;
    const { error } = await supabase.from("students").delete().eq("id", student.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Student record destroyed. The student ID is retired and will not be reused.");
    refreshStudentRecords(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>
                {student.first_name} {student.last_name}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update the student's details — changes apply everywhere in the school."
                  : "Student profile — created automatically when the student was added or imported."}
              </DialogDescription>
            </div>
            {isStaff && !editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-first">First name</Label>
                <Input
                  id="edit-first"
                  value={form.first}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, first: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-last">Last name</Label>
                <Input
                  id="edit-last"
                  value={form.last}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, last: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-chinese">Chinese name</Label>
                <Input
                  id="edit-chinese"
                  value={form.chinese}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, chinese: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-grade">Grade level</Label>
                <Input
                  id="edit-grade"
                  inputMode="numeric"
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-guardian">Guardian email</Label>
                <Input
                  id="edit-guardian"
                  type="email"
                  value={form.guardianEmail}
                  maxLength={255}
                  onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>


        <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/40 p-3">
          <GraduationCap className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold">{graduatingClassLabel(student.grade_level)}</p>
            <p className="text-xs text-muted-foreground">
              Expected high school graduation · currently grade {student.grade_level}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {isStaff ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Student ID</dt>
              <dd className="font-medium">
                {student.student_number ? (
                  <>
                    <span className="sr-only">{studentIdText(student)}</span>
                    <span aria-hidden>{student.student_number}</span>
                  </>
                ) : (
                  "No ID"
                )}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                Locked. Only an administrator can correct a typo, and the old ID is never reused.
              </p>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Chinese name</dt>
            <dd className="font-medium">{student.chinese_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Guardian email
            </dt>
            <dd className="font-medium break-all">{student.guardian_email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Accounts</dt>
            <dd className="flex flex-wrap gap-1">
              <Badge variant={student.user_id ? "default" : "secondary"}>
                Student {student.user_id ? "✓" : "—"}
              </Badge>
              <button
                type="button"
                onClick={() => setShowGuardian((v) => !v)}
                aria-expanded={showGuardian}
                title="View guardian details"
              >
                <Badge
                  variant={student.guardian_user_id ? "default" : "secondary"}
                  className="cursor-pointer"
                >
                  Guardian {student.guardian_user_id ? "✓" : "—"}
                </Badge>
              </button>
            </dd>
          </div>
        </dl>

        {isStaff ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-status">School status</Label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="profile-status"
                  className="h-9 min-w-40 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={statusChoice}
                  onChange={(event) => setStatusChoice(event.target.value as StudentStatus)}
                >
                  {STUDENT_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {studentStatusLabel(option)}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={() => void updateStatus()}>
                  Update status
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Withdraw, transfer out, graduate, or no-show keeps this record and the student ID.
                The student leaves the active directory.
              </p>
            </div>
            {!student.student_number ? (
              <Button type="button" variant="outline" onClick={() => void issue()}>
                Issue student ID
              </Button>
            ) : null}
            {isAdmin && student.student_number ? (
              <div className="space-y-2">
                <Button type="button" variant="outline" onClick={() => setCorrectOpen((open) => !open)}>
                  Correct student ID
                </Button>
                {correctOpen ? (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="correct-student-id">New student ID</Label>
                      <Input
                        id="correct-student-id"
                        value={correctValue}
                        maxLength={40}
                        onChange={(event) => setCorrectValue(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="correct-student-id-reason">Reason</Label>
                      <Input
                        id="correct-student-id-reason"
                        value={correctReason}
                        maxLength={500}
                        onChange={(event) => setCorrectReason(event.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The current ID is retired and will never be used again.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void correct()}
                      disabled={correctReason.trim().length < 3 || correctValue.trim().length < 1}
                    >
                      Save corrected ID
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {isAdmin ? (
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">Destroy student record</h3>
                <p className="text-xs text-muted-foreground">
                  This permanently deletes the student and their grades, attendance, coursework, and
                  other records. The student ID is retired and will never be reused. This is data
                  destruction, not the way a student leaves the school. To keep the record, update
                  the school status instead.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="destroy-student-confirm">
                    Type {destroyConfirm} to confirm
                  </Label>
                  <Input
                    id="destroy-student-confirm"
                    value={destroyText}
                    onChange={(event) => setDestroyText(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={destroyText.trim() !== destroyConfirm}
                  onClick={() => void destroy()}
                >
                  Destroy student record
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {showGuardian ? (
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <h3 className="mb-2 text-sm font-semibold">Guardian details</h3>
            <p className="text-sm">
              <span className="text-muted-foreground">Email: </span>
              <span className="break-all font-medium">{student.guardian_email ?? "—"}</span>
            </p>
            {!student.guardian_user_id ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No guardian account linked yet, so there is no sign-in history.
              </p>
            ) : guardianLogins === undefined ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading sign-in history…</p>
            ) : guardianLogins.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This guardian has not signed in yet.
              </p>
            ) : (
              <div className="mt-2">
                <p className="mb-1 text-xs text-muted-foreground">
                  Last sign-in: {new Date(guardianLogins[0]!.signed_in_at).toLocaleString()} ·{" "}
                  {guardianLogins.length} recorded sign-in
                  {guardianLogins.length === 1 ? "" : "s"}
                </p>
                <ul className="divide-y divide-border rounded-md border border-border bg-background text-sm">
                  {guardianLogins.map((l) => (
                    <li key={l.id} className="px-3 py-1.5">
                      {new Date(l.signed_in_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}


        <div>
          <h3 className="mb-2 text-sm font-semibold">Login activity</h3>
          {!student.user_id ? (
            <p className="text-sm text-muted-foreground">No student account linked yet.</p>
          ) : !logins || logins.length === 0 ? (
            <p className="text-sm text-muted-foreground">This student has not signed in yet.</p>
          ) : (
            <>
              <p className="mb-1 text-xs text-muted-foreground">
                Last sign-in: {new Date(logins[0]!.signed_in_at).toLocaleString()}
              </p>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {logins.map((l) => (
                  <li key={l.id} className="px-3 py-1.5">
                    {new Date(l.signed_in_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Enrolled classes</h3>
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enrolled in any classes yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {enrollments.map((e) => (
                <li key={e.class_id} className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">
                    {e.classes?.name ?? "Class"}
                    {e.classes?.subject ? (
                      <span className="text-muted-foreground"> · {e.classes.subject}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[e.classes?.period, e.classes?.teacher_name].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isStaff ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Detention record</h3>
            {detentions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No detentions on record.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {detentions.map((d) => (
                  <li key={d.id} className="notebook-detention-slip flex items-start justify-between gap-3 px-3 py-2">
                    <span>
                      <span className="font-medium">{d.scheduled_date}</span>
                      <span className="text-muted-foreground"> · {d.reason}</span>
                    </span>
                    <Badge variant="outline" className="capitalize">{d.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Detentions are kept permanently on the student's record.
            </p>
          </div>
        ) : null}
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
