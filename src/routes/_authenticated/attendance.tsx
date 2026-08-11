import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attendanceTone, formatDate } from "@/lib/school";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — Meridian" },
      { name: "description", content: "Take daily roll and review attendance history." },
      { property: "og:title", content: "Attendance — Meridian" },
      { property: "og:description", content: "Take daily roll and review attendance history." },
    ],
  }),
  component: AttendancePage,
});

const STATUSES = ["present", "absent", "tardy", "excused"] as const;

function AttendancePage() {
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, period")
        .order("period");
      if (error) throw error;
      return data;
    },
  });

  const activeClassId = classId || classes[0]?.id || "";

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", activeClassId],
    enabled: Boolean(activeClassId) && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, students(first_name, last_name)")
        .eq("class_id", activeClassId);
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.students?.last_name ?? "").localeCompare(b.students?.last_name ?? ""),
      );
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", activeClassId, date],
    enabled: Boolean(activeClassId) && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, student_id, status, note")
        .eq("class_id", activeClassId)
        .eq("date", date);
      if (error) throw error;
      return data;
    },
  });

  const { data: myHistory = [] } = useQuery({
    queryKey: ["my-attendance-history"],
    enabled: !isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, status, note, classes(name)")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const mark = useMutation({
    mutationFn: async (input: { studentId: string; status: string }) => {
      const { error } = await supabase.from("attendance").upsert(
        {
          class_id: activeClassId,
          student_id: input.studentId,
          date,
          status: input.status,
        },
        { onConflict: "class_id,student_id,date" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["attendance", activeClassId, date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isStaff) {
    return (
      <AppShell title="Attendance" description="Your attendance record for the current term.">
        <div className="panel divide-y divide-border">
          {myHistory.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No attendance recorded yet.</p>
          ) : (
            myHistory.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 text-sm">
                <span className="font-medium">{formatDate(r.date)}</span>
                <span className="text-muted-foreground">{r.classes?.name}</span>
                <Badge variant="secondary" className={attendanceTone(r.status)}>
                  {r.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Attendance" description="Take roll for a class period, one tap per student.">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="class">Class</Label>
          <Select value={activeClassId} onValueChange={setClassId}>
            <SelectTrigger id="class">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="panel mt-6 divide-y divide-border">
        {roster.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No students enrolled in this class yet.
          </p>
        ) : (
          roster.map((r) => {
            const current = records.find((rec) => rec.student_id === r.student_id)?.status;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <span className="font-medium">
                  {r.students?.last_name}, {r.students?.first_name}
                </span>
                <div className="flex gap-2">
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
      </div>
    </AppShell>
  );
}
