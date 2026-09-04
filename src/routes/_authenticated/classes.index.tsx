import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StudentImport } from "@/components/students/StudentImport";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/classes/")({
  head: () => ({
    meta: [
      { title: "Classes — Meraki Education" },
      { name: "description", content: "All class sections for the current term." },
      { property: "og:title", content: "Classes — Meraki Education" },
      { property: "og:description", content: "All class sections for the current term." },
    ],
  }),
  component: ClassesPage,
});

const GRADE_LEVELS = [5, 6, 7, 8, 9] as const;

const emptyForm = {
  name: "",
  subject: "",
  period: "",
  room: "",
  term: "Fall 2026",
  teacher_name: "",
  grade_level: "",
};

function ClassesPage() {
  const { isStaff, isAdmin, teacherMode, user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [rosterTarget, setRosterTarget] = useState<{
    id: string;
    name: string;
    grade: number | null;
  } | null>(null);

  const { data: allClasses = [], isLoading } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term, teacher_id, teacher_name, grade_level")
        .order("period");
      if (error) throw error;
      return data;
    },
  });

  const saveClass = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error("Class name is required");
      if (form.teacher_name.trim().length < 2)
        throw new Error("A teacher name is required for every class");
      const payload = {
        name: form.name.trim().slice(0, 120),
        subject: form.subject.trim().slice(0, 60) || null,
        period: form.period.trim().slice(0, 12) || null,
        room: form.room.trim().slice(0, 20) || null,
        term: form.term.trim().slice(0, 40) || "Fall 2026",
        teacher_name: form.teacher_name.trim().slice(0, 120),
        grade_level: form.grade_level ? Number(form.grade_level) : null,
      };
      if (editingId) {
        const { error } = await supabase.from("classes").update(payload).eq("id", editingId);
        if (error) throw error;
        return null;
      }
      const { data, error } = await supabase
        .from("classes")
        .insert({ ...payload, teacher_id: user?.id ?? null })
        .select("id, name, grade_level")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => {
      toast.success(editingId ? "Class updated" : "Class created");
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      if (created)
        setRosterTarget({ id: created.id, name: created.name, grade: created.grade_level });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Working as a teacher narrows everything to the classes this person teaches,
  // even though their admin row-level access could see the whole school.
  const classes = useMemo(() => {
    if (!teacherMode) return allClasses;
    const myName = (profile?.full_name ?? "").trim().toLowerCase();
    return allClasses.filter(
      (c) =>
        c.teacher_id === user?.id ||
        (!!myName && (c.teacher_name ?? "").trim().toLowerCase() === myName),
    );
  }, [allClasses, teacherMode, user?.id, profile?.full_name]);

  const visible = useMemo(
    () =>
      gradeFilter === "all"
        ? classes
        : gradeFilter === "none"
          ? classes.filter((c) => c.grade_level == null)
          : classes.filter((c) => c.grade_level === Number(gradeFilter)),
    [classes, gradeFilter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const c of visible) {
      const key = c.grade_level == null ? "Ungraded" : `Grade ${c.grade_level}`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "Ungraded" ? 1 : b === "Ungraded" ? -1 : a.localeCompare(b, "en", { numeric: true }),
    );
  }, [visible]);

  return (
    <AppShell
      title={isStaff ? "Classes" : "My classes"}
      description={
        isStaff
          ? "Each section links to its gradebook, assignments and roster."
          : "Open a class to see your coursework, grades, discussions and attendance."
      }
      actions={
        isStaff ? (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) {
                setEditingId(null);
                setForm(emptyForm);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingId(null);
                  setForm({ ...emptyForm, teacher_name: profile?.full_name ?? "" });
                }}
              >
                New class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit class" : "Create a class"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {(
                  [
                    ["name", "Class name", "Math 7 – Section B"],
                    ["teacher_name", "Teacher name (required)", "Ms. Rivera"],
                    ["subject", "Subject", "Mathematics"],
                    ["period", "Period", "3"],
                    ["room", "Room", "204"],
                    ["term", "Term", "Fall 2026"],
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      value={form[key]}
                      placeholder={placeholder}
                      maxLength={120}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label htmlFor="grade_level">Grade level</Label>
                  <Select
                    value={form.grade_level || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, grade_level: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger id="grade_level">
                      <SelectValue placeholder="Select a grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No grade level</SelectItem>
                      {GRADE_LEVELS.map((g) => (
                        <SelectItem key={g} value={String(g)}>
                          Grade {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => saveClass.mutate()} disabled={saveClass.isPending}>
                  {saveClass.isPending
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : "Create class"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading classes…</p>
      ) : classes.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "No classes yet — create your first section to start a gradebook."
              : "You are not enrolled in any classes yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            <Label htmlFor="grade-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
              Grade
            </Label>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger id="grade-filter" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {GRADE_LEVELS.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    Grade {g}
                  </SelectItem>
                ))}
                <SelectItem value="none">Ungraded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {groups.length === 0 ? (
            <div className="panel p-8 text-center">
              <p className="text-sm text-muted-foreground">No classes for this grade.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map(([label, items]) => (
                <section key={label}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {label} · {items.length} {items.length === 1 ? "class" : "classes"}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((c) => {
                      const canEdit = isAdmin || (isStaff && c.teacher_id === user?.id);
                      return (
                        <div key={c.id} className="relative">
                          <Link
                            to="/classes/$classId"
                            params={{ classId: c.id }}
                            className="block panel p-5 transition-shadow hover:shadow-[var(--shadow-float)]"
                          >
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Period {c.period ?? "—"} · {c.term}
                              {c.grade_level != null ? ` · Grade ${c.grade_level}` : ""}
                            </p>
                            <h3 className="mt-2 pr-10 text-lg font-semibold">{c.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {c.subject ?? "General"} · Room {c.room ?? "—"}
                            </p>
                            <p className="mt-1 text-sm font-medium">
                              Teacher: {c.teacher_name || "Unassigned"}
                            </p>
                          </Link>
                          {canEdit ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${c.name}`}
                              className="absolute right-3 top-3"
                              onClick={() => {
                                setEditingId(c.id);
                                setForm({
                                  name: c.name ?? "",
                                  subject: c.subject ?? "",
                                  period: c.period ?? "",
                                  room: c.room ?? "",
                                  term: c.term ?? "Fall 2026",
                                  teacher_name: c.teacher_name ?? "",
                                  grade_level:
                                    c.grade_level != null ? String(c.grade_level) : "",
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {rosterTarget ? (
        <StudentImport
          key={rosterTarget.id}
          classId={rosterTarget.id}
          className={rosterTarget.name}
          gradeLevel={rosterTarget.grade}
          open
          showTrigger={false}
          onOpenChange={(next) => {
            if (!next) setRosterTarget(null);
          }}
        />
      ) : null}
    </AppShell>

  );
}
