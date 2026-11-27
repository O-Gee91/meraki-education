import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowDown, ArrowUp, Check, Circle, Eye, EyeOff, Plus, Asterisk } from "lucide-react";
import { Button } from "@/components/ui/button";
import { letterFor, type GradingSetup } from "@/lib/grading";
import { plannedAssignmentWeights, summarizeOverview, type OverviewStudent } from "@/lib/gradebook-overview";
import { classCalendarDate } from "@/lib/late-penalty";
import { NotebookGrade } from "@/components/Sketch";
import { NotebookMarginNote } from "@/components/NotebookDecorations";

type Assignment = { id: string; title: string; category: string; points_possible: number; due_date: string | null; status: string | null };
type RailClass = { id: string; name: string; period?: string | null };
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
  classes?: RailClass[];
  classId?: string;
  useIds?: boolean;
  onToggleIds?: () => void;
  today?: string;
};

const pct = (value: number | null) => value == null ? "—" : value.toFixed(1);
const shortDate = (d: string | null) => { if (!d) return "—"; const [, m, day] = d.slice(0, 10).split("-"); return `${Number(m)}/${Number(day)}`; };

export function GradebookOverview({ students, visibleStudents, assignments, allAssignments, setup, scoredCounts, ungradedCounts, hideGrades, onHideGrades, onStudent, onCoursework, classes = [], classId, useIds = false, onToggleIds, today = classCalendarDate() }: Props) {
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const summary = useMemo(() => summarizeOverview(students, setup), [students, setup]);
  const weights = useMemo(() => plannedAssignmentWeights(allAssignments, setup), [allAssignments, setup]);
  const ledger = useMemo(() => [...assignments].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")), [assignments]);
  const shown = visibleStudents
    .filter((s) => hideGrades || selectedBand == null || (!s.excluded && s.average != null && letterFor(s.average, setup.scale) === selectedBand))
    .sort((a, b) => (sortDesc ? -1 : 1) * a.name.localeCompare(b.name));
  const maxCount = Math.max(1, ...summary.bands.map((b) => b.count));
  const medianLetter = summary.median != null ? letterFor(summary.median, setup.scale) : null;
  return (
    <div className="flex min-w-0">
      {classes.length > 1 && (
        <nav aria-label="Switch class" className="hidden w-28 shrink-0 flex-col gap-1 border-r border-border bg-muted/40 py-3 md:flex">
          {classes.map((c) => {
            const active = c.id === classId;
            return <Link key={c.id} to="/classes/$classId" params={{ classId: c.id }} aria-current={active ? "page" : undefined}
              className={`truncate rounded-r-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              title={c.period ? `${c.name} · ${c.period}` : c.name}>{c.name}</Link>;
          })}
        </nav>
      )}

      <div className="min-w-0 flex-1 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" onClick={onCoursework}><Plus className="size-4" />New assignment</Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(15rem,1fr)_minmax(0,3fr)]">
          <section className="min-w-0 self-start rounded-md border border-border bg-card" aria-label="Student grade roster">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortDesc(!sortDesc)} aria-label={`Sort students ${sortDesc ? "A to Z" : "Z to A"}`}>
                      Student {sortDesc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold" colSpan={2}>Overall</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <button type="button" disabled={hideGrades} onClick={() => onStudent(s.id)} className="break-words text-left hover:underline disabled:no-underline">{s.name}</button>
                      {s.missing > 0 && !hideGrades && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-warning" title={`${s.missing} missing`}><AlertCircle className="size-3" />{s.missing}</span>}
                    </td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{hideGrades ? "—" : <NotebookGrade seed={`overall:${s.id}`} marked={s.average != null}>{pct(s.average)}</NotebookGrade>}</td>
                    <td className="w-8 px-3 py-1.5 text-left tabular-nums text-muted-foreground">{!hideGrades && s.average != null ? letterFor(s.average, setup.scale) : ""}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={3} className="px-3 py-6 text-muted-foreground">No students match these filters.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="px-3 py-2">Median of {summary.students}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{hideGrades ? "—" : <NotebookGrade seed="class-median" marked={summary.median != null}>{pct(summary.median)}</NotebookGrade>}</td>
                  <td className="px-3 py-2 tabular-nums">{hideGrades ? "" : medianLetter ?? ""}</td>
                </tr>
                {!hideGrades && <tr className="text-xs text-muted-foreground"><td className="px-3 pb-2">Mean · Missing</td><td className="px-1 pb-2 text-right tabular-nums">{pct(summary.mean)}</td><td className="px-3 pb-2 tabular-nums">{summary.missing}</td></tr>}
                {!hideGrades && <tr><td colSpan={3} className="px-3 pb-2"><NotebookMarginNote percent={summary.mean} /></td></tr>}
                {!hideGrades && <tr><td colSpan={3} className="px-3 pb-3 text-xs font-normal text-muted-foreground">The overall percentage counts posted scores only. A draft stays on the grade cell until you post it.</td></tr>}
              </tfoot>
            </table>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2">
              {onToggleIds && <Button variant="link" size="sm" className="h-auto p-0" onClick={onToggleIds} aria-pressed={useIds}>
                {useIds ? "Show student names" : "Show student IDs"}
              </Button>}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { onHideGrades(!hideGrades); setSelectedBand(null); }} aria-pressed={hideGrades}>
                {hideGrades ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{hideGrades ? "Show class grades" : "Hide class grades"}
              </Button>
            </div>
          </section>

          <section className="min-w-0 rounded-md border border-border bg-card" aria-label="Assignment ledger">
            <table className="w-full table-fixed text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-7 px-2 py-2"><span className="sr-only">Status</span></th>
                  <th className="w-14 px-2 py-2 text-left font-semibold">Due</th>
                  <th className="px-2 py-2 text-left font-semibold">Assignment</th>
                  <th className="w-14 px-2 py-2 text-right font-semibold">Points</th>
                  <th className="w-16 px-2 py-2 text-right font-semibold" title="Planned share of the overall grade when all listed assignments count. Actual shares vary with ungraded or excused work and extra credit.">Net</th>
                  <th className="hidden w-32 px-2 py-2 text-left font-semibold sm:table-cell">Category</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((a) => {
                  const pending = ungradedCounts[a.id] ?? 0;
                  const scored = scoredCounts.get(a.id) ?? 0;
                  const draft = a.status === "draft";
                  const upcoming = !!a.due_date && a.due_date > today;
                  const w = weights.get(a.id);
                  const status = draft ? { Icon: Asterisk, cls: "text-warning", label: "Draft — not visible to students" }
                    : pending ? { Icon: Asterisk, cls: "text-warning", label: `${pending} need grading` }
                    : scored ? { Icon: Check, cls: "text-success", label: `${scored} graded` }
                    : upcoming ? { Icon: Circle, cls: "text-muted-foreground", label: "Upcoming" } : null;
                  return (
                    <tr key={a.id} className={`border-b border-border/40 last:border-b-0 hover:bg-muted/30 ${draft ? "text-muted-foreground" : ""}`}>
                      <td className="px-2 py-1.5 text-center">{status && <status.Icon className={`inline size-3.5 ${status.cls}`} aria-label={status.label}><title>{status.label}</title></status.Icon>}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shortDate(a.due_date)}</td>
                      <td className="truncate px-2 py-1.5"><button type="button" onClick={onCoursework} className="max-w-full truncate text-left hover:underline" title={a.title}>{a.title}</button></td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(a.points_possible)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{w == null ? <em>bonus</em> : `${w.toFixed(1)}%`}</td>
                      <td className="hidden truncate px-2 py-1.5 text-muted-foreground sm:table-cell" title={a.category}>{a.category}</td>
                    </tr>
                  );
                })}
                {!ledger.length && <tr><td colSpan={6} className="px-3 py-6 text-muted-foreground">No assignments match these filters.</td></tr>}
              </tbody>
            </table>
            <div className="border-t border-border px-3 py-2">
              <Button variant="link" size="sm" className="h-auto p-0" onClick={onCoursework}><Plus className="size-3.5" />New assignment</Button>
            </div>
          </section>
        </div>

        {!hideGrades && (
          <section className="mt-4 rounded-md border border-border bg-card px-4 py-3" aria-label="Class grade distribution">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="notebook-heading text-sm font-semibold">Grade distribution <span className="ml-1 text-xs font-normal text-muted-foreground">{summary.graded} graded</span></h3>
              {selectedBand && <Button variant="ghost" size="sm" onClick={() => setSelectedBand(null)}>Clear {selectedBand} filter</Button>}
            </div>
            <div className="mt-3 flex items-end gap-1">
              {summary.bands.map((band) => {
                const active = selectedBand ? selectedBand === band.letter : band.letter === medianLetter;
                return (
                  <button key={band.letter} type="button" aria-label={`${band.letter}: ${band.count} students`} aria-pressed={selectedBand === band.letter}
                    onClick={() => setSelectedBand(selectedBand === band.letter ? null : band.letter)}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-xs tabular-nums text-muted-foreground">{band.count || ""}</span>
                    <span className="flex h-20 w-full items-end"><span className="w-full rounded-t-sm bg-foreground/70" style={{ height: `${band.count ? Math.max(6, band.count / maxCount * 100) : 0}%` }} /></span>
                    <span className={`w-full rounded-sm text-center text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : ""}`}>{band.letter}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
