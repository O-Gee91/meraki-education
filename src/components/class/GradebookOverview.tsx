import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Eye, EyeOff, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { letterFor, type GradingSetup } from "@/lib/grading";
import { plannedAssignmentWeights, summarizeOverview, type OverviewStudent } from "@/lib/gradebook-overview";
import { formatDate } from "@/lib/school";
import { todayKey } from "@/lib/assignment-status";
import { NotebookGrade } from "@/components/Sketch";

type Assignment = { id: string; title: string; category: string; points_possible: number; due_date: string | null; status: string | null };
type Props = {
  students: OverviewStudent[];
  visibleStudents: OverviewStudent[];
  assignments: Assignment[];
  allAssignments: Assignment[];
  setup: GradingSetup;
  scoredCounts: Map<string, number>;
  ungradedCounts: Record<string, number>;
  hideGrades: boolean;
  onHideGrades: (hidden: boolean) => void;
  onStudent: (id: string) => void;
  onCoursework: () => void;
};

const pct = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}%`;

export function GradebookOverview({ students, visibleStudents, assignments, allAssignments, setup, scoredCounts, ungradedCounts, hideGrades, onHideGrades, onStudent, onCoursework }: Props) {
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const summary = useMemo(() => summarizeOverview(students, setup), [students, setup]);
  const weights = useMemo(() => plannedAssignmentWeights(allAssignments, setup), [allAssignments, setup]);
  const groups = useMemo(() => {
    const categories = new Map<string, Assignment[]>();
    for (const assignment of assignments) categories.set(assignment.category, [...(categories.get(assignment.category) ?? []), assignment]);
    return [...categories];
  }, [assignments]);
  const shown = visibleStudents.filter((s) => hideGrades || selectedBand == null || (!s.excluded && s.average != null && letterFor(s.average, setup.scale) === selectedBand));
  const maxCount = Math.max(1, ...summary.bands.map((b) => b.count));

  return (
    <div>
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="min-w-0 border-b border-border lg:border-b-0 lg:border-r" aria-label="Student grade roster">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Student roster <span className="ml-1 font-normal text-muted-foreground">{shown.length}</span></h3>
            <Button variant="ghost" size="sm" onClick={() => { onHideGrades(!hideGrades); setSelectedBand(null); }} aria-pressed={hideGrades}>
              {hideGrades ? <Eye className="size-4" /> : <EyeOff className="size-4" />}{hideGrades ? "Show grades" : "Hide grades"}
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_3rem] gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span>Student</span><span className="text-right">Overall</span><span className="text-right">Missing</span>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {shown.map((student) => (
              <div key={student.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_3rem] items-center gap-2 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted/20">
                <div className="min-w-0">
                  <Button variant="link" className="h-auto w-full justify-start whitespace-normal break-words p-0 text-left text-sm font-medium text-foreground" disabled={hideGrades} onClick={() => onStudent(student.id)}>{student.name}</Button>
                  {student.note && <p className="mt-1 text-xs text-muted-foreground">{student.note}</p>}
                </div>
                <div className="text-right tabular-nums">
                  {hideGrades ? <span className="text-muted-foreground">—</span> : <><span className="text-sm font-semibold">{pct(student.average)}</span>{student.average != null && <span className="ml-1 text-xs text-muted-foreground">{letterFor(student.average, setup.scale)}</span>}</>}
                </div>
                <div className="text-right text-sm tabular-nums">{hideGrades ? "—" : student.missing > 0 ? <span className="inline-flex items-center gap-1"><AlertCircle className="size-3 text-warning" />{student.missing}</span> : <span className="text-muted-foreground">—</span>}</div>
              </div>
            ))}
            {!shown.length && <p className="px-4 py-8 text-sm text-muted-foreground">No students match these filters.</p>}
          </div>
          <div className="border-t border-border bg-muted/20 p-4">
            <p className="mb-3 text-xs text-muted-foreground">Class summary · {summary.students} active students</p>
            <dl className="grid grid-cols-3 gap-3">
              <div><dt className="text-xs text-muted-foreground">Median</dt><dd className="mt-1 text-lg font-semibold tabular-nums"><NotebookGrade seed="class-median" marked={!hideGrades && summary.median != null}>{hideGrades ? "—" : pct(summary.median)}</NotebookGrade></dd>{!hideGrades && summary.median != null && <p className="text-xs text-muted-foreground">{letterFor(summary.median, setup.scale)}</p>}</div>
              <div><dt className="text-xs text-muted-foreground">Mean</dt><dd className="mt-1 text-lg font-semibold tabular-nums"><NotebookGrade seed="class-mean" marked={!hideGrades && summary.mean != null}>{hideGrades ? "—" : pct(summary.mean)}</NotebookGrade></dd></div>
              <div><dt className="text-xs text-muted-foreground">Missing work</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{hideGrades ? "—" : summary.missing}</dd></div>
            </dl>
          </div>
        </section>

        <section className="min-w-0" aria-label="Assignment category ledger">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Assignments by category</h3>
            <span className="text-xs text-muted-foreground">{setup.mode === "weighted" ? "Category weighted" : "Total points"}</span>
          </div>
          {groups.map(([category, list]) => {
            const weight = setup.categories.find((c) => c.name === category)?.weight;
            return <details key={category} open className="group/category border-b border-border last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/30 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-not-open/category:-rotate-90" />
                <span className="min-w-0 flex-1 break-words font-semibold">{category}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{list.length} {list.length === 1 ? "item" : "items"}{setup.mode === "weighted" && weight != null ? ` · ${weight}%` : ""}</span>
              </summary>
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_4rem] gap-3 px-4 py-2 text-xs text-muted-foreground"><span>Assignment / due</span><span className="text-right">Points</span><span className="text-right" title="Planned share of the overall grade when all listed assignments count. Actual shares vary with ungraded or excused work and extra credit.">Net %</span></div>
              {list.map((assignment) => {
                const pending = ungradedCounts[assignment.id] ?? 0;
                const scored = scoredCounts.get(assignment.id) ?? 0;
                const draft = assignment.status === "draft";
                const upcoming = !!assignment.due_date && assignment.due_date > todayKey();
                const Icon = draft ? FileText : pending ? Clock : scored ? CheckCircle2 : upcoming ? Clock : FileText;
                return <div key={assignment.id} className="grid grid-cols-[minmax(0,1fr)_3rem_4rem] items-center gap-3 border-t border-border/50 px-4 py-3 hover:bg-muted/20">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${draft || pending ? "text-warning" : scored ? "text-success" : "text-muted-foreground"}`} aria-hidden />
                    <div className="min-w-0">
                      <Button variant="link" className="h-auto justify-start whitespace-normal break-words p-0 text-left text-sm text-foreground" onClick={onCoursework}>{assignment.title}</Button>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{assignment.due_date ? formatDate(assignment.due_date) : "No due date"}</span>{draft ? <Badge variant="outline" className="border-warning/50 text-xs">Draft</Badge> : <span>{pending ? `${pending} need grading` : scored ? `${scored} graded` : upcoming ? "Upcoming" : "Published"}</span>}</div>
                    </div>
                  </div>
                  <span className="text-right text-sm tabular-nums">{Number(assignment.points_possible)}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground" title="Planned weight; actual weight varies by student">{weights.get(assignment.id) == null ? "Bonus" : pct(weights.get(assignment.id) ?? null)}</span>
                </div>;
              })}
            </details>;
          })}
          {!groups.length && <p className="p-8 text-sm text-muted-foreground">No assignments match these filters.</p>}
        </section>
      </div>

      {!hideGrades && <section className="border-t border-border px-4 py-4" aria-label="Class grade distribution">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Grade distribution <span className="ml-1 text-xs font-normal text-muted-foreground">{summary.graded} graded students</span></h3>{selectedBand && <Button variant="ghost" size="sm" onClick={() => setSelectedBand(null)}>Clear {selectedBand} filter</Button>}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.bands.map((band) => <Button key={band.letter} variant="ghost" className={`h-36 min-w-14 flex-1 flex-col justify-end gap-1 rounded-sm px-2 [&_svg]:size-auto ${selectedBand === band.letter ? "bg-secondary ring-1 ring-ring" : ""}`} aria-label={`${band.letter}: ${band.count} students`} aria-pressed={selectedBand === band.letter} onClick={() => setSelectedBand(selectedBand === band.letter ? null : band.letter)}>
            <span className="text-xs tabular-nums text-muted-foreground">{band.count}</span>
            <svg viewBox="0 0 60 72" className="h-[72px]! w-full! max-w-20 shrink-0 text-accent" aria-hidden preserveAspectRatio="none"><rect x="8" y={72 - Math.max(2, band.count / maxCount * 72)} width="44" height={Math.max(2, band.count / maxCount * 72)} fill="currentColor" rx="2" /></svg>
            <span className="max-w-full break-words text-xs">{band.letter}</span>
          </Button>)}
        </div>
      </section>}
    </div>
  );
}