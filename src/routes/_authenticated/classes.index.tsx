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

function ClassesPage() {
  const { isStaff, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    period: "",
    room: "",
    term: "Fall 2026",
  });

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, period, room, term, teacher_id")
        .order("period");
      if (error) throw error;
      return data;
    },
  });

  const createClass = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error("Class name is required");
      const { error } = await supabase.from("classes").insert({
        name: form.name.trim().slice(0, 120),
        subject: form.subject.trim().slice(0, 60) || null,
        period: form.period.trim().slice(0, 12) || null,
        room: form.room.trim().slice(0, 20) || null,
        term: form.term.trim().slice(0, 40) || "Fall 2026",
        teacher_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class created");
      setOpen(false);
      setForm({ name: "", subject: "", period: "", room: "", term: "Fall 2026" });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Classes"
      description="Each section links to its gradebook, assignments and roster."
      actions={
        isStaff ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>New class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a class</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {(
                  [
                    ["name", "Class name", "Math 7 – Section B"],
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
              </div>
              <DialogFooter>
                <Button onClick={() => createClass.mutate()} disabled={createClass.isPending}>
                  {createClass.isPending ? "Creating…" : "Create class"}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link
              key={c.id}
              to="/classes/$classId"
              params={{ classId: c.id }}
              className="panel p-5 transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Period {c.period ?? "—"} · {c.term}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{c.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.subject ?? "General"} · Room {c.room ?? "—"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
