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
import { PREVIEW_READ_ONLY } from "@/hooks/useStudentPreview";
import { useTeacherScope } from "@/hooks/useTeacherScope";

import { supabase } from "@/integrations/supabase/client";
import { formatDate, gradeTone, letterGrade, percent } from "@/lib/school";
import { ElaCatalog } from "@/components/standards/ElaCatalog";
import { PrintTemplates } from "@/components/reports/PrintTemplates";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { compareStudentNames, isTestStudent, sortStudents } from "@/lib/student-sort";
import { ChevronDown, Plus, Trash2 } from "lucide-react";


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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const { isStaff, primaryRole } = useAuth();
  const isStudent = primaryRole === "student";

  return (
    <AppShell
      desktopReview
      title={isStudent ? "My grades & progress" : "Assessment & reporting"}
      description={
        isStudent
          ? "Your report card, the standards you have mastered and the work in your portfolio."
          : "Report cards, standards coverage and student portfolios."
      }
    >
      <Tabs defaultValue="reportcards">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pb-3">
          <TabsTrigger value="reportcards">{isStudent ? "My report card" : "Report cards"}</TabsTrigger>
          <TabsTrigger value="standards">{isStudent ? "My standards" : "Standards"}</TabsTrigger>
          <TabsTrigger value="portfolios">{isStudent ? "My portfolio" : "Portfolios"}</TabsTrigger>
          {isStaff && <TabsTrigger value="templates">Print templates</TabsTrigger>}
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
        {isStaff && (
          <TabsContent value="templates">
            <PrintTemplates />
          </TabsContent>
        )}
      </Tabs>

    </AppShell>
  );
}

function ReportCards({ isStaff }: { isStaff: boolean }) {
  const { user } = useAuth();
  const { classIds, studentIds } = useTeacherScope();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sortMode, setSortMode] = useStudentSort("report-cards");

  const { data: allClasses = [] } = useQuery({
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

  const { data: allStudents = [] } = useQuery({
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

  const { data: allCards = [] } = useQuery({
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

  // Teacher mode keeps report cards limited to the classes this person teaches.
  const classes = classIds ? allClasses.filter((c) => classIds.has(c.id)) : allClasses;
  const students = sortStudents(
    studentIds ? allStudents.filter((s) => studentIds.has(s.id)) : allStudents,
    sortMode,
  );
  const { previewingStudent } = useAuth();
  const cards = [
    ...(classIds ? allCards.filter((c) => classIds.has(c.class_id)) : allCards).filter(
      // Student view: only the demo student's published cards.
      (c) => !previewingStudent || (c.published && !!studentIds?.has(c.student_id)),
    ),
  ].sort(
    (a, b) => {
      const aStudent = students.find((student) => student.id === a.student_id);
      const bStudent = students.find((student) => student.id === b.student_id);
      const byName = compareStudentNames(aStudent, bStudent, sortMode);
      return byName || a.id.localeCompare(b.id);
    },
  );



  const generate = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("Choose a class first");
      const klass = classes.find((c) => c.id === classId);
      const [{ data: rawRoster, error: rosterError }, { data: assignments, error: aError }] =
        await Promise.all([
          supabase
            .from("enrollments")
            .select("student_id, students(first_name, last_name, is_tester)")
            .eq("class_id", classId),
          supabase.from("assignments").select("id, points_possible").eq("class_id", classId),
        ]);
      if (rosterError) throw rosterError;
      if (aError) throw aError;
      // Demo/test accounts never receive report cards.
      const roster = (rawRoster ?? []).filter((r) => !isTestStudent(r.students));
      if (roster.length === 0) throw new Error("This class has no students yet");
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
    <div className="mt-6 space-y-6">
      {isStaff && (
        <div className="flex flex-wrap items-end gap-4 border-b border-border pb-5">
          <div className="w-full max-w-sm space-y-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger aria-label="Report card class">
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
          <StudentSortControl value={sortMode} onChange={setSortMode} />
        </div>
      )}

      <div>
        {cards.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {isStaff
              ? "No report cards yet — generate them from a class gradebook."
              : "No report cards have been published for you yet."}
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] table-fixed text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[25%]" />
              <col className="w-[16%]" />
              <col className={isStaff ? "w-[22%]" : "w-[37%]"} />
              {isStaff ? <col className="w-[15%]" /> : null}
            </colgroup>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Student</th>
                <th className="p-3">Class &amp; term</th>
                <th className="p-3">Grade</th>
                <th className="p-3">Comment</th>
                {isStaff ? <th className="p-3">Status</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cards.map((card) => {
                const pct = card.grade_pct == null ? null : Number(card.grade_pct);
                return (
                  <tr key={card.id} className="[overflow-wrap:anywhere]">
                    <td className="p-3 font-medium">{nameFor(card.student_id)}</td>
                    <td className="p-3">{classFor(card.class_id)}<span className="mt-1 block text-xs text-muted-foreground">{card.term}</span></td>
                    <td className={`p-3 font-semibold ${pct == null ? "" : gradeTone(pct)}`}>
                      {pct == null ? "—" : `${pct.toFixed(1)}% ${card.letter ?? ""}`}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {isStaff ? (
                        <Input
                          aria-label={`Teacher comment for ${nameFor(card.student_id)}`}
                          className="min-w-0"
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
                          variant="outline"
                          className="h-auto min-h-8 w-full whitespace-normal px-2"
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
          </table></div>
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
    <div className="mt-6 space-y-6">
      {isStaff && (
        <details className="group border-b border-border pb-4">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><ChevronDown className="size-4 transition-transform group-open:rotate-180" />Add a standard</summary>
        <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="s-code">Code</Label>
            <Input
              id="s-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="MATH.6.NS.1"
            />
          </div>
          <div className="xl:col-span-2">
            <Label htmlFor="s-desc">Expectation</Label>
            <Input
              id="s-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
              <Label htmlFor="s-subject">Subject</Label>
              <Input
                id="s-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <Button variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
              Add
            </Button>
          </div>
        </div>
        </details>
      )}

      <section>
        <h2 className="text-sm font-semibold">Standards coverage</h2>
        <ul className="mt-4 divide-y divide-border">
          {standards.map((s) => {
            const covered = links.filter((l) => l.standard_id === s.id);
            return (
              <li key={s.id} className="py-4 [overflow-wrap:anywhere]">
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
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                {covered.length > 0 ? (
                  <p className="mt-2 max-w-prose text-xs text-muted-foreground">
                    {covered.map((c) => c.assignments?.title ?? "Assessment").join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {standards.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No standards in the school library yet.</p> : null}
      </section>
      <details className="group border-t border-border pt-4">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><ChevronDown className="size-4 transition-transform group-open:rotate-180" />Common Core ELA library</summary>
        <div className="mt-4 max-w-4xl"><ElaCatalog isStaff={isStaff} /></div>
      </details>
    </div>
  );
}

function PortfoliosTab({ isStaff }: { isStaff: boolean }) {
  const { user, previewingStudent } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ studentId: "", title: "", link: "", description: "" });
  const [sortMode, setSortMode] = useStudentSort("portfolios");

  const { data: allPortfolioStudents = [] } = useQuery({
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
  const previewScope = useTeacherScope();
  const students = previewingStudent
    ? allPortfolioStudents.filter((s) => previewScope.studentIds?.has(s.id))
    : allPortfolioStudents;
  const sortedStudents = sortStudents(students, sortMode);

  const { data: allItems = [] } = useQuery({
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
  const items = previewingStudent
    ? allItems.filter((it) => previewScope.studentIds?.has(it.student_id))
    : allItems;


  const add = useMutation({
    mutationFn: async () => {
      if (previewingStudent) throw new Error(PREVIEW_READ_ONLY);
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
    <div className="mt-6 space-y-6">
      <section className="border-b border-border pb-6">
      <h2 className="mb-4 text-sm font-semibold">Add portfolio work</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {isStaff && (
          <div>
            <Label>Student</Label>
            <Select
              value={form.studentId}
              onValueChange={(studentId) => setForm({ ...form, studentId })}
            >
              <SelectTrigger aria-label="Portfolio student">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                 {sortedStudents.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.last_name}, {s.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2">
              <StudentSortControl value={sortMode} onChange={setSortMode} className="w-full" />
            </div>
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
        <div>
            <Label htmlFor="p-desc">Note</Label>
            <Input
              id="p-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
        </div>
        <div className="flex items-end md:col-span-2">
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="size-4" />Add work
          </Button>
        </div>
      </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <p className="col-span-full py-6 text-sm text-muted-foreground">
            No portfolio work yet. Add evidence of learning — projects, photos, reflections.
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{item.kind}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
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
              <Button variant="ghost" size="icon" title="Remove portfolio work" aria-label={`Remove ${item.title}`}
                onClick={() => remove.mutate(item.id)}
                className="mt-3 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
