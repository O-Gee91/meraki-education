import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setStudentStatus } from "@/lib/student-ids.functions";
import {
  STUDENT_RECORD_QUERY_KEYS,
  STUDENT_STATUSES,
  studentStatusLabel,
  type StudentStatus,
} from "@/lib/student-ids";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type ExitStudent = {
  id: string;
  first_name: string;
  last_name: string;
};

const EXIT_STATUSES = STUDENT_STATUSES.filter((status) => status !== "active");

export function StudentExitDialog({
  students,
  open,
  onOpenChange,
  onComplete,
}: {
  students: ExitStudent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setStudentStatus);
  const [status, setStatus] = useState<StudentStatus>("withdrawn");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setStatus("withdrawn");
  }, [open]);
  const count = students.length;
  const one = students[0];

  const submit = async () => {
    if (count === 0) return;
    setPending(true);
    try {
      for (const student of students) {
        await changeStatus({ data: { studentId: student.id, status } });
      }
      for (const queryKey of STUDENT_RECORD_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
      toast.success(
        count === 1
          ? `${one?.first_name ?? "Student"} is marked ${studentStatusLabel(status).toLowerCase()}. The student ID stays on file.`
          : `${count} students are marked ${studentStatusLabel(status).toLowerCase()}. Their student IDs stay on file.`,
      );
      onOpenChange(false);
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update student status");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count === 1
              ? `Update ${one?.first_name ?? ""} ${one?.last_name ?? ""}`.trim()
              : `Update ${count} students`}
          </DialogTitle>
          <DialogDescription>
            This keeps the student record and the student ID. The student leaves the active
            directory. Staff can still search by the full student ID for a records request.
            Withdrawing is not the same as deleting the record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="student-exit-status">How is this student leaving?</Label>
          <select
            id="student-exit-status"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as StudentStatus)}
          >
            {EXIT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {studentStatusLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || count === 0}>
            {pending ? "Saving…" : studentStatusLabel(status)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
