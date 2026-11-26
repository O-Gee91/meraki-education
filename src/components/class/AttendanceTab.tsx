import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { attendanceTone, formatDate } from "@/lib/school";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";
import { NotebookAttendance, NotebookEmpty, NotebookLoading } from "@/components/NotebookDecorations";
import { LoadError } from "@/components/LoadError";
import { useNotebookStyle } from "@/components/NotebookStyle";
import {
  attendanceDayKey,
  attendanceHistoryKey,
  attendanceRosterKey,
  countRecordedAttendance,
  loadAttendanceRows,
  OWN_ATTENDANCE_HISTORY_LIMIT,
  writeInBatches,
} from "@/lib/notebook-attendance";
import { attendanceReadKind, classAttendanceNotebookVisible } from "@/lib/notebook-style";

const STATUSES = ["present", "absent", "tardy", "excused"] as const;

export function AttendanceTab({ classId }: { classId: string }) {
  const { isStaff } = useAuth();
  const style = useNotebookStyle();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortMode, setSortMode] = useStudentSort(`attendance-${classId}`);
  const staffView = isStaff && attendanceReadKind(true) === "class-day";

  const rosterQuery = useQuery({
    queryKey: attendanceRosterKey(classId),
    enabled: Boolean(classId) && staffView,
    queryFn: () =>
      loadAttendanceRows((from, to) =>
        supabase
          .from("enrollments")
          .select("id, student_id, students(first_name, last_name)")
          .eq("class_id", classId)
          .order("id")
          .range(from, to),
      ),
  });

  const recordsQuery = useQuery({
    queryKey: attendanceDayKey(classId, date),
    enabled: Boolean(classId) && staffView,
    queryFn: () =>
      loadAttendanceRows((from, to) =>
        supabase
          .from("attendance")
          .select("id, student_id, status, note")
          .eq("class_id", classId)
          .eq("date", date)
          .order("id")
          .range(from, to),
      ),
  });

  const historyQuery = useQuery({
    queryKey: attendanceHistoryKey(classId),
    enabled: Boolean(classId) && !staffView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, status, note")
        .eq("class_id", classId)
        .order("date", { ascending: false })
        .order("id", { ascending: false })
        .limit(OWN_ATTENDANCE_HISTORY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const roster = rosterQuery.data ?? [];
  const records = recordsQuery.data ?? [];

  const mark = useMutation({
    mutationFn: async (input: { studentId: string; status: string }) => {
      const { error } = await supabase.from("attendance").upsert(
        {
          class_id: classId,
          student_id: input.studentId,
          date,
          status: input.status,
        },
        { onConflict: "class_id,student_id,date" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attendanceDayKey(classId, date) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const markAll = useMutation({
    mutationFn: async (status: string) => {
      const rows = roster.map((r) => ({
        class_id: classId,
        student_id: r.student_id,
        date,
        status,
      }));
      await writeInBatches(rows, async (batch) => {
        const { error } = await supabase.from("attendance").upsert(batch, {
          onConflict: "class_id,student_id,date",
        });
        return { error };
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attendanceDayKey(classId, date) }),
    onError: (e: Error) => {
      toast.error(e.message);
      void queryClient.invalidateQueries({ queryKey: attendanceDayKey(classId, date) });
    },
  });

  if (!staffView) {
    if (historyQuery.isPending) {
      return <NotebookLoading className="mt-4 text-sm text-muted-foreground">Loading attendance…</NotebookLoading>;
    }
    if (historyQuery.isError) {
      return (
        <LoadError
          label="Attendance couldn't be loaded. Nothing here is treated as a blank record."
          onRetry={() => void historyQuery.refetch()}
        />
      );
    }
    const myHistory = historyQuery.data ?? [];
    return (
      <div className="panel mt-4 divide-y divide-border">
        {myHistory.length === 0 ? (
          <NotebookEmpty className="p-6 text-sm text-muted-foreground">No attendance recorded yet.</NotebookEmpty>
        ) : (
          myHistory.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 text-sm">
              <span className="font-medium">{formatDate(r.date)}</span>
              <Badge variant="secondary" className={attendanceTone(r.status)}>
                {r.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    );
  }

  const rosterFailed = rosterQuery.isError || recordsQuery.isError;
  const rosterLoading = !rosterFailed && (rosterQuery.isPending || recordsQuery.isPending);
  const sortedRoster = sortStudents(roster, sortMode, (row) => ({
    id: row.student_id,
    first_name: row.students?.first_name,
    last_name: row.students?.last_name,
  }));

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
       <div className="w-44 space-y-1.5">
        <Label htmlFor="attendance-date">Date</Label>
        <Input
          id="attendance-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
       </div>
       <StudentSortControl value={sortMode} onChange={setSortMode} />
      </div>

      {rosterFailed ? (
        <LoadError
          label="Attendance couldn't be loaded. Marks stay hidden so a failed read is not treated as an empty day."
          onRetry={() => {
            void rosterQuery.refetch();
            void recordsQuery.refetch();
          }}
        />
      ) : rosterLoading ? (
        <NotebookLoading className="mt-4 text-sm text-muted-foreground">Loading attendance…</NotebookLoading>
      ) : roster.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Mark all:</span>
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              onClick={() => markAll.mutate(s)}
              disabled={markAll.isPending}
            >
              {s}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              const ids = records.map((r) => r.id).filter(Boolean);
              try {
                await writeInBatches(ids, async (batch) => {
                  const { error } = await supabase.from("attendance").delete().in("id", batch);
                  return { error };
                });
                void queryClient.invalidateQueries({ queryKey: attendanceDayKey(classId, date) });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't clear attendance");
                void queryClient.invalidateQueries({ queryKey: attendanceDayKey(classId, date) });
              }
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      {classAttendanceNotebookVisible(style, staffView) && !rosterFailed && !rosterLoading ? (
        <NotebookAttendance seed={`attendance:${classId}:${date}`} counts={countRecordedAttendance(roster.map((row) => row.student_id), records)} />
      ) : null}
      {!rosterFailed && !rosterLoading ? <div className="panel mt-4 divide-y divide-border">
        {roster.length === 0 ? (
          <NotebookEmpty className="p-6 text-sm text-muted-foreground">
            No students enrolled in this class yet.
          </NotebookEmpty>
        ) : (
           sortedRoster.map((r) => {
            const current = records.find((rec) => rec.student_id === r.student_id)?.status;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <span className="font-medium">
                  {r.students?.last_name}, {r.students?.first_name}
                </span>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={current === s ? "default" : "outline"}
                      onClick={() => mark.mutate({ studentId: r.student_id, status: s })}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div> : null}
    </div>
  );
}
