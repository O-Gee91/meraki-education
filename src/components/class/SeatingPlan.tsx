import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { studentIdText, studentShortLabel } from "@/lib/student-display";

export type SeatStudent = {
  id: string;
  first_name: string;
  last_name: string;
  student_number?: string | null;
};

const COLS = 5;

export function SeatingPlan({
  classId,
  students,
  isStaff,
  useIds = false,
}: {
  classId: string;
  students: SeatStudent[];
  isStaff: boolean;
  useIds?: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: seats = [] } = useQuery({
    queryKey: ["seats", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seats")
        .select("id, student_id, row_index, col_index")
        .eq("class_id", classId);
      if (error) throw error;
      return data;
    },
  });

  const autoSeat = useMutation({
    mutationFn: async () => {
      const rows = students.map((s, i) => ({
        class_id: classId,
        student_id: s.id,
        row_index: Math.floor(i / COLS),
        col_index: i % COLS,
      }));
      if (rows.length === 0) throw new Error("Add students to the roster first");
      const { error } = await supabase
        .from("seats")
        .upsert(rows, { onConflict: "class_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seating plan generated");
      queryClient.invalidateQueries({ queryKey: ["seats", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async (input: { studentId: string; row: number; col: number }) => {
      const { error } = await supabase.from("seats").upsert(
        {
          class_id: classId,
          student_id: input.studentId,
          row_index: input.row,
          col_index: input.col,
        },
        { onConflict: "class_id,student_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seats", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("seats").delete().eq("class_id", classId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["seats", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = Math.max(1, ...seats.map((s) => s.row_index + 1));
  const seated = new Set(seats.map((s) => s.student_id));
  const unseated = students.filter((s) => !seated.has(s.id));

  function studentAt(row: number, col: number) {
    const seat = seats.find((s) => s.row_index === row && s.col_index === col);
    if (!seat) return null;
    return students.find((s) => s.id === seat.student_id) ?? null;
  }

  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => autoSeat.mutate()} disabled={autoSeat.isPending}>
            Generate seating plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => clear.mutate()}>
            Clear plan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            Print roster
          </Button>
        </div>
      )}

      <div className="panel p-5">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Front of room · whiteboard
        </p>
        {seats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No seating plan yet{isStaff ? " — generate one to get started." : "."}
          </p>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, row) => (
              <div key={row} className="grid grid-cols-5 gap-3">
                {Array.from({ length: COLS }).map((__, col) => {
                  const student = studentAt(row, col);
                  return (
                    <div
                      key={col}
                      className={
                        student
                          ? "rounded-md border border-border bg-secondary/60 p-3 text-center text-xs font-medium"
                          : "rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground"
                      }
                    >
                      <Armchair className="mx-auto mb-1 size-4 text-accent" aria-hidden />
                      {useIds && student ? <span className="sr-only">{studentIdText(student)}</span> : null}
                      <span aria-hidden={useIds && !!student}>
                        {student ? studentShortLabel(student, useIds) : "empty"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {isStaff && unseated.length > 0 && (
        <div className="panel p-4">
          <h3 className="text-sm font-semibold">Unseated students</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {unseated.map((s, i) => (
              <Button
                key={s.id}
                size="sm"
                variant="outline"
                onClick={() =>
                  move.mutate({
                    studentId: s.id,
                    row: rows,
                    col: i % COLS,
                  })
                }
              >
                {useIds ? <span className="sr-only">Seat {studentIdText(s)}</span> : null}
                <span aria-hidden={useIds}>Seat {studentShortLabel(s, useIds)}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
