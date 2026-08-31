import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ClassRow = {
  id: string;
  name: string;
  subject: string | null;
  period: string | null;
  term: string;
  grade_level: number | null;
};

export function MoveStudentsButton({
  classId,
  studentIds,
  enrollmentIds,
  triggerLabel = "Add to other classes",
  disabled,
}: {
  classId: string;
  studentIds: string[];
  enrollmentIds: string[];
  triggerLabel?: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [dropAfter, setDropAfter] = useState(false);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes-for-move"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, term, grade_level")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const [filter, setFilter] = useState<string>("all");

  const others = classes.filter((c) => c.id !== classId);
  const grades = [...new Set(others.map((c) => c.grade_level).filter((g): g is number => !!g))].sort(
    (a, b) => a - b,
  );
  const isHomeroom = (c: ClassRow) =>
    `${c.name} ${c.subject ?? ""}`.toLowerCase().includes("homeroom");
  const options =
    filter === "all"
      ? others
      : filter === "homeroom"
        ? others.filter(isHomeroom)
        : others.filter((c) => String(c.grade_level) === filter);

  const move = useMutation({
    mutationFn: async () => {
      if (studentIds.length === 0) throw new Error("Select at least one student");
      if (targets.length === 0) throw new Error("Pick at least one class");

      const { data: existing, error: existingError } = await supabase
        .from("enrollments")
        .select("class_id, student_id")
        .in("class_id", targets)
        .in("student_id", studentIds);
      if (existingError) throw existingError;

      const taken = new Set((existing ?? []).map((e) => `${e.class_id}:${e.student_id}`));
      const rows = targets.flatMap((cid) =>
        studentIds
          .filter((sid) => !taken.has(`${cid}:${sid}`))
          .map((sid) => ({ class_id: cid, student_id: sid })),
      );

      if (rows.length > 0) {
        const { error } = await supabase.from("enrollments").insert(rows);
        if (error) throw error;
      }

      if (dropAfter && enrollmentIds.length > 0) {
        const { error } = await supabase.from("enrollments").delete().in("id", enrollmentIds);
        if (error) throw error;
      }

      return rows.length;
    },
    onSuccess: (added) => {
      toast.success(
        dropAfter
          ? `Moved ${studentIds.length} student${studentIds.length === 1 ? "" : "s"} — grades in this class are kept.`
          : added === 0
            ? "Those students were already in the selected classes."
            : `Added ${added} enrollment${added === 1 ? "" : "s"}.`,
      );
      setOpen(false);
      setTargets([]);
      setDropAfter(false);
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (cid: string) =>
    setTargets((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {studentIds.length} student{studentIds.length === 1 ? "" : "s"} to other classes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter</span>
            {[
              { key: "all", label: "All classes" },
              { key: "homeroom", label: "Homerooms" },
              ...grades.map((g) => ({ key: String(g), label: `Grade ${g}` })),
            ].map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your classes…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don’t have any other classes to add these students to yet.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {options.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`move-${c.id}`}
                    checked={targets.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  <Label htmlFor={`move-${c.id}`} className="text-sm font-normal">
                    {c.name}
                    <span className="text-muted-foreground">
                      {c.grade_level ? ` · Grade ${c.grade_level}` : ""}
                      {c.period ? ` · Period ${c.period}` : ""} · {c.term}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="move-drop"
              checked={dropAfter}
              onCheckedChange={(v) => setDropAfter(v === true)}
            />
            <Label htmlFor="move-drop" className="text-sm font-normal">
              Also drop them from this class
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Dropping a student only removes them from the class roster. Their grades, submissions
            and attendance history for this class are kept and reappear if they are re-enrolled.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() => move.mutate()}
            disabled={move.isPending || targets.length === 0 || studentIds.length === 0}
          >
            {move.isPending ? "Saving…" : dropAfter ? "Move students" : "Add to classes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
