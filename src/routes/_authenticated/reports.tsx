import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, gradeTone, letterGrade, percent } from "@/lib/school";
import { ElaCatalog } from "@/components/standards/ElaCatalog";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Assessment & reporting — Meraki Education" },
      {
        name: "description",
        content:
          "Standards-based grading, report cards and student portfolios of learning evidence in one reporting workspace.",
      },
      { property: "og:title", content: "Assessment & reporting — Meraki Education" },
      {
        property: "og:description",
        content:
          "Generate term report cards from the gradebook, track standards coverage and curate portfolios of student work.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { isStaff } = useAuth();

  return (
    <AppShell
      title="Assessment & reporting"
      description="Report cards, standards coverage and student portfolios."
    >
      <Tabs defaultValue="reportcards">
        <TabsList>
          <TabsTrigger value="reportcards">Report cards</TabsTrigger>
          <TabsTrigger value="standards">Standards</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
        </TabsList>
        <TabsContent value="reportcards">
          <ReportCards isStaff={isStaff} />
        </TabsContent>
        <TabsContent value="standards">
          <StandardsTab isStaff={isStaff} />
        </TabsContent>
        <TabsContent value="portfolios">
          <PortfoliosTab isStaff={isStaff} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ReportCards({ isStaff }: { isStaff: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, term")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["report-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select("id, student_id, class_id, term, grade_pct, letter, comment, published, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("Choose a class first");
      const klass = classes.find((c) => c.id === classId);
      const [{ data: roster, error: rosterError }, { data: assignments, error: aError }] =
        await Promise.all([
          supabase.from("enrollments").select("student_id").eq("class_id", classId),
          supabase.from("assignments").select("id, points_possible").eq("class_id", classId),
        ]);
      if (rosterError) throw rosterError;
      if (aError) throw aError;
      if (!roster || roster.length === 0) throw new Error("This class has no students yet");
      const assignmentIds = (assignments ?? []).map((a) => a.id);
      const { data: grades, error: gError } = assignmentIds.length
        ? await supabase
            .from("grades")
            .select("student_id, assignment_id, points_earned")
            .in("assignment_id", assignmentIds)
        : { data: [], error: null };
      if (gError) throw gError;

      const rows = roster.map((r) => {
        let earned = 0;
        let possible = 0;
        for (const g of grades ?? []) {
          if (g.student_id !== r.student_id || g.points_earned == null) continue;
          const assignment = (assignments ?? []).find((a) => a.id === g.assignment_id);
          if (!assignment) continue;
          earned += Number(g.points_earned);
          possible += Number(assignment.points_possible);
        }
        const pct = possible ? percent(earned, possible) : null;
        return {
          student_id: r.student_id,
          class_id: classId,
          term: klass?.term ?? "Fall 2026",
          grade_pct: pct,
          letter: pct == null ? null : letterGrade(pct),
          created_by: user!.id,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from("report_cards")
        .upsert(rows, { onConflict: "student_id,class_id,term" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report cards generated from the gradebook");
      queryClient.invalidateQueries({ queryKey: ["report-cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("report_cards")
        .update({ ...input.patch, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-cards"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const nameFor = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.last_name}, ${s.first_name}` : "Student";
  };
  const classFor = (id: string) => classes.find((c) => c.id === id)?.name ?? "Class";

  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <div className="panel flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-56">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.term}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            Generate term report cards
          </Button>
        </div>
      )}

      <div className="panel overflow-x-auto p-0">
        {cards.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {isStaff
              ? "No report cards yet — generate them from a class gradebook."
              : "No report cards have been published for you yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Student</th>
                <th className="p-3">Class</th>
                <th className="p-3">Term</th>
                <th className="p-3">Grade</th>
                <th className="p-3">Comment</th>
                {isStaff ? <th className="p-3">Status</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cards.map((card) => {
                const pct = card.grade_pct == null ? null : Number(card.grade_pct);
                return (
                  <tr key={card.id}>
                    <td className="p-3 font-medium">{nameFor(card.student_id)}</td>
                    <td className="p-3 text-muted-foreground">{classFor(card.class_id)}</td>
                    <td className="p-3 text-muted-foreground">{card.term}</td>
                    <td className={`p-3 font-semibold ${pct == null ? "" : gradeTone(pct)}`}>
                      {pct == null ? "—" : `${pct.toFixed(1)}% ${card.letter ?? ""}`}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {isStaff ? (
                        <Input
                          defaultValue={card.comment ?? ""}
                          placeholder="Teacher comment"
                          onBlur={(e) => {
                            if (e.target.value !== (card.comment ?? "")) {
                              update.mutate({ id: card.id, patch: { comment: e.target.value } });
                            }
                          }}
                        />
                      ) : (
                        (card.comment ?? "—")
                      )}
                    </td>
                    {isStaff ? (
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant={card.published ? "outline" : "default"}
                          onClick={() =>
                            update.mutate({
                              id: card.id,
                              patch: { published: !card.published },
                            })
                          }
                        >
                          {card.published ? "Unpublish" : "Publish"}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StandardsTab({ isStaff }: { isStaff: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: "", description: "", subject: "" });

  const { data: standards = [] } = useQuery({
    queryKey: ["standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standards")
        .select("id, code, description, subject, grade_level")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["assignment-standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_standards")
        .select("id, standard_id, assignment_id, assignments(title, class_id)");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (form.code.trim().length < 2 || form.description.trim().length < 5) {
        throw new Error("Add a code and description");
      }
      const { error } = await supabase.from("standards").insert({
        code: form.code.trim(),
        description: form.description.trim(),
        subject: form.subject.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ code: "", description: "", subject: "" });
      toast.success("Standard added");
      queryClient.invalidateQueries({ queryKey: ["standards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4 space-y-4">
      <ElaCatalog isStaff={isStaff} />
      {isStaff && (
        <div className="panel grid gap-3 p-5 sm:grid-cols-4">
          <div>
            <Label htmlFor="s-code">Code</Label>
            <Input
              id="s-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="MATH.6.NS.1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="s-desc">Expectation</Label>
            <Input
              id="s-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="s-subject">Subject</Label>
              <Input
                id="s-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="panel p-5">
        <h2 className="text-sm font-semibold">Standards coverage</h2>
        <ul className="mt-4 divide-y divide-border">
          {standards.map((s) => {
            const covered = links.filter((l) => l.standard_id === s.id);
            return (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{s.code}</Badge>
                  {s.subject ? (
                    <span className="text-xs text-muted-foreground">{s.subject}</span>
                  ) : null}
                  <span
                    className={
                      "ml-auto text-xs font-medium " +
                      (covered.length ? "text-success" : "text-muted-foreground")
                    }
                  >
                    {covered.length
                      ? `${covered.length} assessment${covered.length > 1 ? "s" : ""} tagged`
                      : "not yet assessed"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                {covered.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {covered.map((c) => c.assignments?.title ?? "Assessment").join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Tag assessments to standards from a class page → Assignments.
        </p>
      </div>
    </div>
  );
}

function PortfoliosTab({ isStaff }: { isStaff: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ studentId: "", title: "", link: "", description: "" });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["portfolio-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_items")
        .select("id, student_id, title, description, link, kind, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const studentId = isStaff ? form.studentId : (students[0]?.id ?? "");
      if (!studentId) throw new Error("Select a student");
      if (form.title.trim().length < 2) throw new Error("Give the work a title");
      const { error } = await supabase.from("portfolio_items").insert({
        student_id: studentId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        link: form.link.trim() || null,
        kind: isStaff ? "evidence" : "artifact",
        added_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ studentId: form.studentId, title: "", link: "", description: "" });
      toast.success("Added to portfolio");
      queryClient.invalidateQueries({ queryKey: ["portfolio-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-items"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const nameFor = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}` : "Student";
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="panel grid gap-3 p-5 sm:grid-cols-4">
        {isStaff && (
          <div>
            <Label>Student</Label>
            <Select
              value={form.studentId}
              onValueChange={(studentId) => setForm({ ...form, studentId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.last_name}, {s.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="p-title">Title</Label>
          <Input
            id="p-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Water cycle poster"
          />
        </div>
        <div>
          <Label htmlFor="p-link">Link (optional)</Label>
          <Input
            id="p-link"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="p-desc">Note</Label>
            <Input
              id="p-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <p className="panel p-6 text-sm text-muted-foreground">
            No portfolio work yet. Add evidence of learning — projects, photos, reflections.
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="panel p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{item.kind}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{nameFor(item.student_id)}</p>
              {item.description ? <p className="mt-2 text-sm">{item.description}</p> : null}
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-accent hover:underline"
                >
                  Open work
                </a>
              ) : null}
              <button
                onClick={() => remove.mutate(item.id)}
                className="mt-3 block text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
