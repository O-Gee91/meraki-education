import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export const CO_TEACHER_LEVELS = {
  full: { label: "Full access", help: "Everything, including class settings" },
  teaching: { label: "Teaching", help: "Coursework, grades, attendance, files — no settings" },
  grading: { label: "Grading", help: "Enter grades and feedback" },
  view_only: { label: "View only", help: "See class materials and roster" },
} as const;
export type CoTeacherLevel = keyof typeof CO_TEACHER_LEVELS;

export function CoTeachersPanel({ classId }: { classId: string }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newLevel, setNewLevel] = useState<CoTeacherLevel>("teaching");

  const { data: owner } = useQuery({
    queryKey: ["class-owner", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("teacher_id, teacher_name")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: coTeachers = [] } = useQuery({
    queryKey: ["co-teachers", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_co_teachers")
        .select("id, teacher_id, permission_level, profiles(full_name, email)")
        .eq("class_id", classId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const canManage = isAdmin || (!!user && owner?.teacher_id === user.id);

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-directory"],
    enabled: open && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_staff");
      if (error) throw error;
      return data ?? [];
    },
  });

  const taken = useMemo(
    () => new Set([owner?.teacher_id, ...coTeachers.map((c) => c.teacher_id)].filter(Boolean)),
    [owner, coTeachers],
  );
  const candidates = staff.filter(
    (s) =>
      !taken.has(s.id) &&
      `${s.full_name} ${s.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["co-teachers", classId] });

  const add = useMutation({
    mutationFn: async () => {
      const rows = [...picked].map((teacher_id) => ({
        class_id: classId,
        teacher_id,
        permission_level: newLevel,
        added_by: user?.id ?? null,
      }));
      const { error } = await supabase.from("class_co_teachers").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} co-teacher${n === 1 ? "" : "s"}`);
      setPicked(new Set());
      setSearch("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, level }: { id: string; level: CoTeacherLevel }) => {
      const { error } = await supabase
        .from("class_co_teachers")
        .update({ permission_level: level })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_co_teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Co-teacher removed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="mr-1 h-4 w-4" />
          Co-teachers{coTeachers.length ? ` (${coTeachers.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Class teaching team</DialogTitle>
          <DialogDescription>
            {canManage
              ? "Add as many co-teachers as you need and choose what each person can do."
              : "Only the primary teacher or an admin can change the team."}
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-md border border-border">
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm font-medium">{owner?.teacher_name || "Unassigned"}</span>
            <Badge>Primary teacher</Badge>
          </li>
          {coTeachers.map((c) => {
            const level = c.permission_level as CoTeacherLevel;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.profiles?.full_name ?? "Staff member"}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.profiles?.email}</p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Select
                      value={level}
                      onValueChange={(v) => update.mutate({ id: c.id, level: v as CoTeacherLevel })}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CO_TEACHER_LEVELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${c.profiles?.full_name ?? "co-teacher"}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${c.profiles?.full_name ?? "this co-teacher"} from the class?`))
                          remove.mutate(c.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary">{CO_TEACHER_LEVELS[level]?.label ?? level}</Badge>
                )}
              </li>
            );
          })}
          {coTeachers.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No co-teachers yet.</li>
          )}
        </ul>

        {canManage && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Add co-teachers</h3>
            <Input
              placeholder="Search staff by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching staff.</p>
              ) : (
                candidates.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={picked.has(s.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(picked);
                        if (v) next.add(s.id);
                        else next.delete(s.id);
                        setPicked(next);
                      }}
                    />
                    <span className="truncate">{s.full_name}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.email}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={newLevel} onValueChange={(v) => setNewLevel(v as CoTeacherLevel)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CO_TEACHER_LEVELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{CO_TEACHER_LEVELS[newLevel].help}</span>
              <Button
                className="ml-auto"
                size="sm"
                disabled={picked.size === 0 || add.isPending}
                onClick={() => add.mutate()}
              >
                Add {picked.size || ""} co-teacher{picked.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
