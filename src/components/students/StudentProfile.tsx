import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { graduatingClassLabel } from "@/lib/academic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: number;
  guardian_email: string | null;
  student_number: string | null;
  chinese_name: string | null;
  user_id: string | null;
  guardian_user_id: string | null;
};

export function StudentProfile({
  student,
  open,
  onOpenChange,
}: {
  student: StudentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {student.first_name} {student.last_name}
          </DialogTitle>
          <DialogDescription>
            Student profile — created automatically when the student was added or imported.
          </DialogDescription>
        </DialogHeader>

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
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Student ID</dt>
            <dd className="font-medium">{student.student_number ?? "—"}</dd>
          </div>
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
              <Badge variant={student.guardian_user_id ? "default" : "secondary"}>
                Guardian {student.guardian_user_id ? "✓" : "—"}
              </Badge>
            </dd>
          </div>
        </dl>

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
      </DialogContent>
    </Dialog>
  );
}
