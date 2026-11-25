import { useMemo, useState } from "react";
import { missingPointsFor } from "@/lib/late-penalty";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/query";
import { formatDate, percent } from "@/lib/school";
import { computeAverage, isAutoGradeComment, letterFor, markCodeFromComment, parseGradingSetup } from "@/lib/grading";
import { QUESTION_KIND_LABELS, type QuestionKind } from "@/lib/assessments";
import { sortStudents } from "@/lib/student-sort";
import {
  buildDocument,
  docHeader,
  downloadHtml,
  escapeHtml,
  printHtml,
  slugify,
} from "@/lib/print-doc";

type TemplateId =
  | "report_card"
  | "progress_report"
  | "standards_checklist"
  | "assessment_paper"
  | "answer_sheet"
  | "attendance_behavior";

const TEMPLATES: { id: TemplateId; name: string; blurb: string; needs: string }[] = [
  {
    id: "report_card",
    name: "Term report card",
    blurb: "One page per student with term grade, letter, teacher comment and signature lines.",
    needs: "Class",
  },
  {
    id: "progress_report",
    name: "Progress report",
    blurb: "Assignment-by-assignment breakdown with category totals for a mid-term update.",
    needs: "Class",
  },
  {
    id: "standards_checklist",
    name: "Standards mastery checklist",
    blurb: "Standards down the page, students across — mark mastery by hand or in conference.",
    needs: "Class",
  },
  {
    id: "assessment_paper",
    name: "Printable assessment paper",
    blurb: "Question paper with choices, answer space and rubric notes for pencil-and-paper use.",
    needs: "Assessment",
  },
  {
    id: "answer_sheet",
    name: "Bubble answer sheet",
    blurb: "Blank scannable-style sheet with lettered bubbles and written-response lines.",
    needs: "Assessment (optional)",
  },
  {
    id: "attendance_behavior",
    name: "Attendance & behavior summary",
    blurb: "Per-student attendance counts, strike totals and detention status for the term.",
    needs: "Class",
  },
];

export function PrintTemplates() {
  const [template, setTemplate] = useState<TemplateId>("report_card");
  const [classId, setClassId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, term, room, period, weights")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["print-assessments", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, kind, instructions, due_at, class_id")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const active = useMemo(() => TEMPLATES.find((t) => t.id === template)!, [template]);
  const klass = classes.find((c) => c.id === classId);
  const setup = parseGradingSetup(klass?.weights);

  const needsAssessment = template === "assessment_paper";

  async function roster() {
    const { data, error } = await supabase
      .from("enrollments")
      .select("student_id, students(id, first_name, last_name, grade_level, student_number)")
      .eq("class_id", classId);
    if (error) throw error;
    return sortStudents((data ?? [])
      .map((r) => r.students)
      .filter((s): s is NonNullable<typeof s> => !!s));
  }

  function headerMeta(extra: string[] = []) {
    return [
      klass ? `${klass.name}${klass.subject ? ` · ${klass.subject}` : ""}` : "All classes",
      klass?.term ?? "",
      ...extra,
    ].filter(Boolean);
  }

  async function build(): Promise<{ html: string; filename: string }> {
    if (template !== "answer_sheet" && !needsAssessment && !classId) {
      throw new Error("Choose a class first");
    }
    if (needsAssessment && !assessmentId) throw new Error("Choose an assessment first");

    if (template === "report_card") {
      const students = await roster();
      const [{ data: cards }, { data: assignments }] = await Promise.all([
        supabase
          .from("report_cards")
          .select("student_id, term, grade_pct, letter, comment")
          .eq("class_id", classId),
        supabase.from("assignments").select("id, points_possible, category, due_date, late_penalty_enabled, late_penalty_mode, late_penalty_per_day, late_penalty_zero_after_days").eq("class_id", classId),
      ]);
      const ids = (assignments ?? []).map((a) => a.id);
      const grades = ids.length
        ? await fetchAll((from, to) =>
            supabase
              .from("grades")
              .select("student_id, assignment_id, points_earned, comment")
              .in("assignment_id", ids)
              .order("id")
              .range(from, to),
          )
        : [];

      const pages = students.map((s) => {
        const card = (cards ?? []).find((c) => c.student_id === s.id);
        let earned = 0;
        let possible = 0;
        for (const g of grades ?? []) {
          if (g.student_id !== s.id || g.points_earned == null) continue;
          const a = (assignments ?? []).find((x) => x.id === g.assignment_id);
          if (!a) continue;
          earned += Number(g.points_earned);
          possible += Number(a.points_possible);
        }
        const average = computeAverage(
          (assignments ?? []).map((a) => {
            const g = (grades ?? []).find((grade) => grade.student_id === s.id && grade.assignment_id === a.id);
            return {
              category: a.category,
              pointsPossible: Number(a.points_possible),
              pointsEarned: g?.points_earned == null ? null : Number(g.points_earned),
              markCode: markCodeFromComment(g?.comment),
              missingPoints: missingPointsFor(a),
            };
          }),
          setup,
        );
        const pct = card?.grade_pct != null ? Number(card.grade_pct) : average;
        return `<section class="page">
          ${docHeader("Term report card", headerMeta([`${s.last_name}, ${s.first_name}`]))}
          <table>
            <tr><th>Student</th><td>${escapeHtml(`${s.first_name} ${s.last_name}`)}</td>
              <th>Grade level</th><td>${s.grade_level}</td></tr>
            <tr><th>Student #</th><td>${escapeHtml(s.student_number ?? "—")}</td>
              <th>Term</th><td>${escapeHtml(card?.term ?? klass?.term ?? "—")}</td></tr>
            <tr><th>Overall</th><td class="num">${pct == null ? "—" : `${pct.toFixed(1)}%`}</td>
              <th>Letter</th><td>${escapeHtml(card?.letter ?? (pct == null ? "—" : letterFor(pct, setup.scale)))}</td></tr>
          </table>
          <h2>Points summary</h2>
          <table><tr><th>Points earned</th><th>Points possible</th><th>Assignments graded</th></tr>
          <tr><td class="num">${earned}</td><td class="num">${possible}</td><td class="num">${
            (grades ?? []).filter((g) => g.student_id === s.id && g.points_earned != null).length
          }</td></tr></table>
          <h2>Teacher comment</h2>
          <div class="box lines">${
            card?.comment ? `<p>${escapeHtml(card.comment)}</p>` : "<div></div><div></div><div></div>"
          }</div>
          <div class="sign"><div>Teacher signature</div><div>Guardian signature</div><div>Date</div></div>
        </section>`;
      });
      return {
        html: buildDocument(
          `Report cards — ${klass?.name ?? ""}`,
          pages.join("") || "<p class='muted'>No students enrolled in this class.</p>",
        ),
        filename: `report-cards-${slugify(klass?.name ?? "class")}`,
      };
    }

    if (template === "progress_report") {
      const students = await roster();
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, title, category, points_possible, due_date, late_penalty_enabled, late_penalty_mode, late_penalty_per_day, late_penalty_zero_after_days")
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      const ids = (assignments ?? []).map((a) => a.id);
      const grades = ids.length
        ? await fetchAll((from, to) =>
            supabase
              .from("grades")
              .select("student_id, assignment_id, points_earned, comment")
              .in("assignment_id", ids)
              .order("id")
              .range(from, to),
          )
        : [];

      const pages = students.map((s) => {
        const rows = (assignments ?? []).map((a) => {
          const g = (grades ?? []).find((x) => x.student_id === s.id && x.assignment_id === a.id);
          const pts = g?.points_earned == null ? null : Number(g.points_earned);
          return `<tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(a.category)}</td>
            <td>${escapeHtml(formatDate(a.due_date))}</td>
            <td class="num">${pts == null ? "—" : pts}</td>
            <td class="num">${Number(a.points_possible)}</td>
            <td class="num">${pts == null ? "—" : `${percent(pts, Number(a.points_possible)).toFixed(0)}%`}</td>
            <td>${escapeHtml(g?.comment && !isAutoGradeComment(g.comment) ? g.comment.trim() : "")}</td></tr>`;
        });
        const pct = computeAverage(
          (assignments ?? []).map((a) => {
            const g = (grades ?? []).find((grade) => grade.student_id === s.id && grade.assignment_id === a.id);
            return {
              category: a.category,
              pointsPossible: Number(a.points_possible),
              pointsEarned: g?.points_earned == null ? null : Number(g.points_earned),
              markCode: markCodeFromComment(g?.comment),
              missingPoints: missingPointsFor(a),
            };
          }),
          setup,
        );
        return `<section class="page">
          ${docHeader("Progress report", headerMeta([`${s.last_name}, ${s.first_name}`]))}
          <p class="muted">Grade ${s.grade_level} · current standing ${
            pct == null ? "—" : `${pct.toFixed(1)}% (${letterFor(pct, setup.scale)})`
          }</p>
          <table><tr><th>Assignment</th><th>Category</th><th>Due</th><th>Score</th><th>Out of</th><th>%</th><th>Comment</th></tr>
          ${rows.join("") || "<tr><td colspan='7' class='muted'>No assignments yet.</td></tr>"}</table>
          <h2>Next steps</h2><div class="box lines"><div></div><div></div><div></div></div>
          <div class="sign"><div>Teacher signature</div><div>Guardian signature</div><div>Date</div></div>
        </section>`;
      });
      return {
        html: buildDocument(
          `Progress reports — ${klass?.name ?? ""}`,
          pages.join("") || "<p class='muted'>No students enrolled in this class.</p>",
        ),
        filename: `progress-reports-${slugify(klass?.name ?? "class")}`,
      };
    }

    if (template === "standards_checklist") {
      const [students, { data: standards }] = await Promise.all([
        roster(),
        supabase.from("standards").select("code, description, subject").order("code"),
      ]);
      const cols = students.slice(0, 8);
      const rows = (standards ?? []).map(
        (s) =>
          `<tr><td><strong>${escapeHtml(s.code)}</strong><br /><span class="muted">${escapeHtml(
            s.description,
          )}</span></td>${cols.map(() => "<td></td>").join("")}</tr>`,
      );
      return {
        html: buildDocument(
          "Standards mastery checklist",
          `${docHeader("Standards mastery checklist", headerMeta())}
          <p class="muted">Mark each standard: B beginning · D developing · S secure · E exceeding.</p>
          <table><tr><th style="width:40%">Standard</th>${cols
            .map((c) => `<th>${escapeHtml(`${c.last_name}, ${c.first_name[0]}.`)}</th>`)
            .join("")}</tr>
          ${rows.join("") || "<tr><td class='muted'>No standards in the library yet.</td></tr>"}</table>
          ${
            students.length > cols.length
              ? `<p class="muted">${students.length - cols.length} more students — print again per group for wider rosters.</p>`
              : ""
          }`,
        ),
        filename: `standards-checklist-${slugify(klass?.name ?? "class")}`,
      };
    }

    if (template === "assessment_paper") {
      const assessment = assessments.find((a) => a.id === assessmentId);
      const { data: questions, error } = await supabase
        .from("assessment_questions")
        .select("position, kind, prompt, options, points, rubric")
        .eq("assessment_id", assessmentId)
        .order("position");
      if (error) throw error;
      const total = (questions ?? []).reduce((sum, q) => sum + Number(q.points), 0);
      const body = (questions ?? []).map((q) => {
        const kind = q.kind as QuestionKind;
        const options = Array.isArray(q.options) ? (q.options as string[]) : [];
        let answerArea = "";
        if (kind === "multiple_choice" || kind === "multi_select") {
          answerArea = `<ul>${options
            .map((o, i) => `<li>${String.fromCharCode(65 + i)}. ${escapeHtml(String(o))}</li>`)
            .join("")}</ul>`;
        } else if (kind === "true_false") {
          answerArea = `<p>True &nbsp; / &nbsp; False</p>`;
        } else if (kind === "essay") {
          answerArea = `<div class="lines">${"<div></div>".repeat(10)}</div>`;
        } else {
          answerArea = `<div class="lines"><div></div><div></div></div>`;
        }
        return `<div class="box"><p><strong>${q.position}. </strong>${escapeHtml(q.prompt)}
          <span class="muted">(${escapeHtml(QUESTION_KIND_LABELS[kind] ?? kind)} · ${Number(
            q.points,
          )} pts)</span></p>${answerArea}${
          q.rubric ? `<p class="muted">Rubric: ${escapeHtml(q.rubric)}</p>` : ""
        }</div>`;
      });
      return {
        html: buildDocument(
          assessment?.title ?? "Assessment",
          `${docHeader(assessment?.title ?? "Assessment", headerMeta([`Total ${total} pts`]))}
          <table><tr><th>Name</th><td style="width:35%"></td><th>Date</th><td></td></tr></table>
          ${assessment?.instructions ? `<div class="box"><p>${escapeHtml(assessment.instructions)}</p></div>` : ""}
          ${body.join("") || "<p class='muted'>This assessment has no questions yet.</p>"}`,
        ),
        filename: `assessment-${slugify(assessment?.title ?? "paper")}`,
      };
    }

    if (template === "answer_sheet") {
      const assessment = assessments.find((a) => a.id === assessmentId);
      let count = 25;
      if (assessmentId) {
        const { count: qCount } = await supabase
          .from("assessment_questions")
          .select("id", { count: "exact", head: true })
          .eq("assessment_id", assessmentId);
        count = qCount && qCount > 0 ? qCount : 25;
      }
      const rows = Array.from({ length: count }, (_, i) => {
        const bubbles = ["A", "B", "C", "D", "E"]
          .map((l) => `<span>${l}</span>`)
          .join("");
        return `<tr><td class="num" style="width:36px">${i + 1}</td><td class="bubbles">${bubbles}</td>
          <td class="lines" style="width:45%"><div></div></td></tr>`;
      });
      return {
        html: buildDocument(
          "Answer sheet",
          `${docHeader("Answer sheet", headerMeta([assessment?.title ?? "Blank sheet"]))}
          <table><tr><th>Name</th><td style="width:35%"></td><th>Date</th><td></td></tr></table>
          <table>${rows.join("")}</table>`,
        ),
        filename: `answer-sheet-${slugify(assessment?.title ?? klass?.name ?? "blank")}`,
      };
    }

    const students = await roster();
    const studentIds = students.map((s) => s.id);
    const [{ data: attendance }, { data: notes }, { data: detentions }] = await Promise.all([
      fetchAll((from, to) =>
        supabase.from("attendance").select("id, student_id, status").eq("class_id", classId).order("id").range(from, to),
      ).then((data) => ({ data })),
      studentIds.length
        ? fetchAll((from, to) =>
            supabase.from("behavior_notes").select("id, student_id, kind, severity").in("student_id", studentIds).order("id").range(from, to),
          ).then((data) => ({ data }))
        : Promise.resolve({ data: [] as { student_id: string; kind: string; severity: number }[] }),
      studentIds.length
        ? fetchAll((from, to) =>
            supabase
              .from("detentions")
              .select("id, student_id, status, scheduled_date")
              .in("student_id", studentIds)
              .order("id")
              .range(from, to),
          ).then((data) => ({ data }))
        : Promise.resolve({ data: [] as { student_id: string; status: string; scheduled_date: string }[] }),
    ]);
    const rows = students.map((s) => {
      const mine = (attendance ?? []).filter((a) => a.student_id === s.id);
      const tally = (status: string) => mine.filter((a) => a.status === status).length;
      const strikes = (notes ?? []).filter(
        (n) => n.student_id === s.id && n.kind !== "positive",
      ).length;
      const det = (detentions ?? []).filter((d) => d.student_id === s.id);
      return `<tr><td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
        <td class="num">${tally("present")}</td><td class="num">${tally("tardy")}</td>
        <td class="num">${tally("absent")}</td><td class="num">${tally("excused")}</td>
        <td class="num">${strikes}</td>
        <td>${det.length ? escapeHtml(det.map((d) => `${formatDate(d.scheduled_date)} (${d.status})`).join(", ")) : "—"}</td></tr>`;
    });
    return {
      html: buildDocument(
        "Attendance & behavior summary",
        `${docHeader("Attendance & behavior summary", headerMeta())}
        <table><tr><th>Student</th><th>Present</th><th>Tardy</th><th>Absent</th><th>Excused</th><th>Strikes</th><th>Detentions</th></tr>
        ${rows.join("") || "<tr><td colspan='7' class='muted'>No students enrolled.</td></tr>"}</table>
        <h2>Notes</h2><div class="box lines"><div></div><div></div></div>`,
      ),
      filename: `attendance-behavior-${slugify(klass?.name ?? "class")}`,
    };
  }

  async function run(action: "print" | "download") {
    setBusy(true);
    try {
      const { html, filename } = await build();
      if (action === "print") printHtml(html);
      else downloadHtml(html, filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Button variant="ghost"
            key={t.id}
            type="button"
            onClick={() => setTemplate(t.id)}
            aria-pressed={template === t.id}
            className={
              "h-auto min-w-0 flex-col items-stretch justify-start whitespace-normal rounded-lg border p-4 text-left " +
              (template === t.id ? "border-primary bg-secondary/40" : "border-border")
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 text-sm font-semibold">{t.name}</h3>
              <Badge variant="outline">{t.needs}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t.blurb}</p>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-border pt-5">
        <div className="w-full max-w-sm space-y-1.5">
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
        {(needsAssessment || template === "answer_sheet") && (
          <div className="w-full max-w-sm space-y-1.5">
            <Label>Assessment</Label>
            <Select value={assessmentId} onValueChange={setAssessmentId} disabled={!classId}>
              <SelectTrigger>
                <SelectValue placeholder={classId ? "Select an assessment" : "Pick a class first"} />
              </SelectTrigger>
              <SelectContent>
                {assessments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={() => run("print")} disabled={busy}>
          Print {active.name.toLowerCase()}
        </Button>
        <Button variant="outline" onClick={() => run("download")} disabled={busy}>
          Download
        </Button>
      </div>
    </div>
  );
}
