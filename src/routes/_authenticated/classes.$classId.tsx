import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassFeed } from "@/components/class/ClassFeed";
import { ClassPolls } from "@/components/class/ClassPolls";
import { SeatingPlan } from "@/components/class/SeatingPlan";
import { formatDate, gradeTone, letterGrade, percent } from "@/lib/school";


export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class gradebook — Meraki Education" },
      {
        name: "description",
        content: "Gradebook, assignments and roster for a single class section.",
      },
      { property: "og:title", content: "Class gradebook — Meraki Education" },
      {
        property: "og:description",
        content: "Gradebook, assignments and roster for a single class section.",
      },
    ],
  }),
  component: ClassDetailPage,
});

const CATEGORIES = ["Homework", "Quiz", "Test", "Project", "Participation"];

function ClassDetailPage() {
  const { classId } = Route.useParams();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();

  const { data: klass } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, students(id, first_name, last_name, grade_level)")
        .eq("class_id", classId);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.students)
        .sort((a, b) =>
          (a.students?.last_name ?? "").localeCompare(b.students?.last_name ?? ""),
        );
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, category, points_possible, due_date, description")
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const assignmentIds = assignments.map((a) => a.id);
  const { data: grades = [] } = useQuery({
    queryKey: ["grades", classId, assignmentIds.length],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, assignment_id, student_id, points_earned")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      return data;
    },
  });

  const gradeFor = (studentId: string, assignmentId: string) =>
    grades.find((g) => g.student_id === studentId && g.assignment_id === assignmentId);

  const saveGrade = useMutation({
    mutationFn: async (input: { studentId: string; assignmentId: string; value: string }) => {
      const raw = input.value.trim();
      const points = raw === "" ? null : Number(raw);
      if (points != null && (Number.isNaN(points) || points < 0 || points > 10000)) {
        throw new Error("Enter a valid score");
      }
      const { error } = await supabase.from("grades").upsert(
        {
          assignment_id: input.assignmentId,
          student_id: input.studentId,
          points_earned: points,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grades", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function studentAverage(studentId: string) {
    let earned = 0;
    let possible = 0;
    for (const a of assignments) {
      const g = gradeFor(studentId, a.id);
      if (g?.points_earned == null) continue;
      earned += Number(g.points_earned);
      possible += Number(a.points_possible);
    }
    return possible ? percent(earned, possible) : null;
  }

  return (
    <AppShell
      title={klass?.name ?? "Class"}
      description={
        klass
          ? `${klass.subject ?? "General"} · Period ${klass.period ?? "—"} · Room ${klass.room ?? "—"} · ${klass.term}`
          : undefined
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/classes">All classes</Link>
        </Button>
      }
    >
      <Tabs defaultValue="gradebook">
        <TabsList className="flex-wrap">
          <TabsTrigger value="gradebook">Gradebook</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="feed">Class feed</TabsTrigger>
          <TabsTrigger value="seating">Seating plan</TabsTrigger>
          <TabsTrigger value="polls">Polls</TabsTrigger>
        </TabsList>


        <TabsContent value="gradebook">
          <div className="panel mt-4 overflow-x-auto p-0">
            {roster.length === 0 || assignments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Add students to the roster and create assignments to see the gradebook.
              </p>
            ) : (
              <table className="w-full min-w-max text-sm">
                <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-secondary/40 px-4 py-3">Student</th>
                    {assignments.map((a) => (
                      <th key={a.id} className="px-3 py-3 font-medium">
                        <div className="max-w-32 truncate" title={a.title}>
                          {a.title}
                        </div>
                        <div className="text-[10px] normal-case text-muted-foreground">
                          {a.category} · {a.points_possible} pts
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {roster.map((r) => {
                    const avg = studentAverage(r.student_id);
                    return (
                      <tr key={r.id}>
                        <td className="sticky left-0 bg-card px-4 py-2 font-medium">
                          {r.students?.last_name}, {r.students?.first_name}
                        </td>
                        {assignments.map((a) => {
                          const g = gradeFor(r.student_id, a.id);
                          return (
                            <td key={a.id} className="px-3 py-2">
                              {isStaff ? (
                                <Input
                                  className="h-8 w-20"
                                  inputMode="decimal"
                                  defaultValue={g?.points_earned ?? ""}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === String(g?.points_earned ?? "")) return;
                                    saveGrade.mutate({
                                      studentId: r.student_id,
                                      assignmentId: a.id,
                                      value,
                                    });
                                  }}
                                />
                              ) : (
                                <span>
                                  {g?.points_earned ?? "—"}/{a.points_possible}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 font-semibold">
                          {avg == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={gradeTone(avg)}>
                              {avg.toFixed(1)}% {letterGrade(avg)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsTab classId={classId} isStaff={isStaff} assignments={assignments} />
        </TabsContent>

        <TabsContent value="roster">
          <RosterTab classId={classId} isStaff={isStaff} roster={roster} />
        </TabsContent>

        <TabsContent value="feed">
          <ClassFeed scope={{ classId }} />
        </TabsContent>

        <TabsContent value="seating">
          <SeatingPlan
            classId={classId}
            isStaff={isStaff}
            students={roster
              .map((r) => r.students)
              .filter((s): s is NonNullable<typeof s> => !!s)
              .map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }))}
          />
        </TabsContent>

        <TabsContent value="polls">
          <ClassPolls classId={classId} isStaff={isStaff} />
        </TabsContent>
      </Tabs>

    </AppShell>
  );
}

type AssignmentRow = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
  description: string | null;
};

function AssignmentsTab({
  classId,
  isStaff,
  assignments,
}: {
  classId: string;
  isStaff: boolean;
  assignments: AssignmentRow[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "Homework",
    points: "100",
    due: "",
    description: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Assignment title is required");
      const points = Number(form.points);
      if (Number.isNaN(points) || points <= 0 || points > 10000)
        throw new Error("Points possible must be between 1 and 10000");
      const { error } = await supabase.from("assignments").insert({
        class_id: classId,
        title: form.title.trim().slice(0, 140),
        category: form.category,
        points_possible: points,
        due_date: form.due || null,
        description: form.description.trim().slice(0, 1000) || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment added");
      setOpen(false);
      setForm({ title: "", category: "Homework", points: "100", due: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4">
      {isStaff && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New assignment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  maxLength={140}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="points">Points possible</Label>
                  <Input
                    id="points"
                    inputMode="numeric"
                    value={form.points}
                    onChange={(e) => setForm({ ...form, points: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due">Due date</Label>
                <Input
                  id="due"
                  type="date"
                  value={form.due}
                  onChange={(e) => setForm({ ...form, due: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Instructions</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Add assignment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="panel mt-4 divide-y divide-border">
        {assignments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{a.title}</p>
                {a.description ? (
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">{a.description}</p>
                ) : null}
                <AssignmentStandards assignmentId={a.id} isStaff={isStaff} />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{a.category}</Badge>
                <span>{a.points_possible} pts</span>
                <span>Due {formatDate(a.due_date)}</span>
              </div>
            </div>
          ))

        )}
      </div>
    </div>
  );
}

function AssignmentStandards({
  assignmentId,
  isStaff,
}: {
  assignmentId: string;
  isStaff: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: standards = [] } = useQuery({
    queryKey: ["standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standards")
        .select("id, code, description")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["assignment-standards", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_standards")
        .select("id, standard_id")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
  });

  const tag = useMutation({
    mutationFn: async (standardId: string) => {
      const { error } = await supabase
        .from("assignment_standards")
        .insert({ assignment_id: assignmentId, standard_id: standardId });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["assignment-standards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const untag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignment_standards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignment-standards"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const codeFor = (id: string) => standards.find((s) => s.id === id)?.code ?? "standard";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <Badge key={l.id} variant="outline" className="gap-1">
          {codeFor(l.standard_id)}
          {isStaff ? (
            <button onClick={() => untag.mutate(l.id)} className="text-muted-foreground">
              ×
            </button>
          ) : null}
        </Badge>
      ))}
      {isStaff &&
        (adding ? (
          <div className="w-64">
            <Select onValueChange={(v) => tag.mutate(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a standard" />
              </SelectTrigger>
              <SelectContent>
                {standards
                  .filter((s) => !links.some((l) => l.standard_id === s.id))
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-accent hover:underline"
          >
            + tag standard
          </button>
        ))}
    </div>
  );
}



type RosterRow = {
  id: string;
  student_id: string;
  students: { id: string; first_name: string; last_name: string; grade_level: number } | null;
};

function RosterTab({
  classId,
  isStaff,
  roster,
}: {
  classId: string;
  isStaff: boolean;
  roster: RosterRow[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a student");
      const { error } = await supabase
        .from("enrollments")
        .insert({ class_id: classId, student_id: selected });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added to class");
      setSelected("");
      queryClient.invalidateQueries({ queryKey: ["roster", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("enrollments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from class");
      queryClient.invalidateQueries({ queryKey: ["roster", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enrolledIds = new Set(roster.map((r) => r.student_id));
  const available = students.filter((s) => !enrolledIds.has(s.id));

  return (
    <div className="mt-4">
      {isStaff && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="student">Add student</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="student">
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No students available
                  </SelectItem>
                ) : (
                  available.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.last_name}, {s.first_name} (Gr {s.grade_level})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
            Add to class
          </Button>
        </div>
      )}

      <div className="panel mt-4 divide-y divide-border">
        {roster.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No students enrolled yet.</p>
        ) : (
          roster.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 text-sm">
              <span className="font-medium">
                {r.students?.last_name}, {r.students?.first_name}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>Grade {r.students?.grade_level}</span>
                {isStaff && (
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
