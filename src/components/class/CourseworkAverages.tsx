import { useMemo, useState } from "react";
import { ChevronDown, CircleCheck, CircleAlert, TriangleAlert, Info } from "lucide-react";
import {
  computeAverage,
  findMark,
  isExtraCredit,
  markCodeFromComment,
  type GradingSetup,
} from "@/lib/grading";
import { formatDate } from "@/lib/school";

type Assignment = {
  id: string;
  title: string;
  category: string;
  points_possible: number;
  due_date: string | null;
};
type Grade = {
  assignment_id: string;
  student_id: string;
  points_earned: number | null;
  comment: string | null;
};

type Props = {
  assignments: Assignment[];
  grades: Grade[];
  setup: GradingSetup;
  isStaff: boolean;
  studentIds: string[];
};

export function fmtPct(pct: number | null | undefined) {
  return pct == null || Number.isNaN(pct) ? "—" : `${pct.toFixed(1)}%`;
}

function band(pct: number | null) {
  if (pct == null) return { text: "text-muted-foreground", bg: "bg-muted/50 border-border", Icon: null, label: "No grades yet" };
  if (pct >= 90) return { text: "text-success", bg: "bg-success/10 border-success/30", Icon: CircleCheck, label: "Strong" };
  if (pct >= 70) return { text: "text-warning-foreground dark:text-warning", bg: "bg-warning/15 border-warning/40", Icon: TriangleAlert, label: "On track" };
  return { text: "text-destructive", bg: "bg-destructive/10 border-destructive/30", Icon: CircleAlert, label: "Needs attention" };
}

function Pct({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  const b = band(value);
  const Icon = b.Icon;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${b.text} ${size === "lg" ? "text-3xl" : "text-sm"}`} title={b.label}>
      {Icon && <Icon className={size === "lg" ? "h-6 w-6" : "h-3.5 w-3.5"} aria-hidden />}
      {value == null ? (size === "lg" ? "No grades yet" : "—") : fmtPct(value)}
      <span className="sr-only">({b.label})</span>
    </span>
  );
}

/** Percentage one grade row contributes, honouring special marks. null = not counted. */
function gradePct(g: Grade, a: Assignment, setup: GradingSetup): number | null {
  const possible = Number(a.points_possible) || 0;
  if (!possible) return null;
  const mark = findMark(markCodeFromComment(g.comment), setup.marks);
  if (mark) {
    if (mark.behavior === "exclude") return null;
    if (mark.behavior === "zero") return 0;
    return Number(mark.value ?? 0);
  }
  if (g.points_earned == null) return null;
  return (Number(g.points_earned) / possible) * 100;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function CourseworkAverages({ assignments, grades, setup, isStaff, studentIds }: Props) {
  const inRoster = useMemo(() => new Set(studentIds), [studentIds]);
  const relevant = useMemo(
    () => (isStaff ? grades.filter((g) => inRoster.has(g.student_id)) : grades),
    [grades, isStaff, inRoster],
  );

  const items = useMemo(
    () =>
      assignments.map((a) => {
        const pcts = relevant
          .filter((g) => g.assignment_id === a.id)
          .map((g) => gradePct(g, a, setup))
          .filter((p): p is number => p != null);
        return {
          a,
          avg: mean(pcts),
          high: pcts.length ? Math.max(...pcts) : null,
          low: pcts.length ? Math.min(...pcts) : null,
          graded: pcts.length,
        };
      }),
    [assignments, relevant, setup],
  );

  const rowsFor = (studentId: string | null, list: Assignment[]) =>
    list.map((a) => {
      const g = relevant.find((x) => x.assignment_id === a.id && (studentId == null || x.student_id === studentId));
      return {
        category: a.category,
        pointsPossible: Number(a.points_possible),
        pointsEarned: g?.points_earned ?? null,
        markCode: markCodeFromComment(g?.comment),
      };
    });

  const overall = useMemo(() => {
    if (!isStaff) return computeAverage(rowsFor(null, assignments), setup);
    return mean(
      studentIds
        .map((id) => computeAverage(rowsFor(id, assignments), setup))
        .filter((p): p is number => p != null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, relevant, setup, isStaff, studentIds]);

  const categories = useMemo(() => {
    const names = [...new Set(assignments.map((a) => a.category))].filter((c) => !isExtraCredit(c));
    const flat = { ...setup, mode: "unweighted" as const };
    return names.map((name) => {
      const list = assignments.filter((a) => a.category === name);
      const avg = isStaff
        ? mean(
            studentIds
              .map((id) => computeAverage(rowsFor(id, list), flat))
              .filter((p): p is number => p != null),
          )
        : computeAverage(rowsFor(null, list), flat);
      return { name, avg, count: list.length };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, relevant, setup, isStaff, studentIds]);

  const long = items.length > 8;
  const [listOpen, setListOpen] = useState(isStaff ? items.length <= 15 : !long);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (!assignments.length) return null;
  const ob = band(overall);

  return (
    <section className="mb-6 space-y-4" aria-label="Averages summary">
      <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_1fr]">
        <div className={`rounded-lg border p-4 ${ob.bg}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isStaff ? "Class average" : "My overall average"}
          </p>
          <div className="mt-1"><Pct value={overall} size="lg" /></div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ob.label} · {assignments.length} {assignments.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.name} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${band(c.avg).bg}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? "item" : "items"}</p>
              </div>
              <span className="text-base"><Pct value={c.avg} /></span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold"
        >
          <span>{isStaff ? "Class average per item" : "My score per item"} ({items.length})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${listOpen ? "rotate-180" : ""}`} />
        </button>
        {listOpen && (
          <ul className="divide-y divide-border border-t border-border">
            {items.map(({ a, avg, high, low, graded }) => {
              const open = expanded.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => isStaff && toggle(a.id)}
                    aria-expanded={isStaff ? open : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${isStaff ? "hover:bg-muted/40" : "cursor-default"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.category} · Due {formatDate(a.due_date)}</p>
                    </div>
                    <Pct value={avg} />
                    {isStaff && <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
                  </button>
                  {isStaff && open && (
                    <dl className="grid grid-cols-3 gap-2 bg-muted/30 px-4 py-2 text-xs">
                      <div><dt className="text-muted-foreground">Highest</dt><dd><Pct value={high} /></dd></div>
                      <div><dt className="text-muted-foreground">Lowest</dt><dd><Pct value={low} /></dd></div>
                      <div><dt className="text-muted-foreground">Graded</dt><dd className="text-sm font-semibold">{graded} / {studentIds.length}</dd></div>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer items-center gap-1"><Info className="h-3.5 w-3.5" /> What do the colors mean?</summary>
        <ul className="mt-2 flex flex-wrap gap-3">
          <li className="inline-flex items-center gap-1 text-success"><CircleCheck className="h-3.5 w-3.5" /> 90% and above — strong</li>
          <li className="inline-flex items-center gap-1 text-warning-foreground dark:text-warning"><TriangleAlert className="h-3.5 w-3.5" /> 70–89.9% — on track</li>
          <li className="inline-flex items-center gap-1 text-destructive"><CircleAlert className="h-3.5 w-3.5" /> Below 70% — needs attention</li>
          <li>Excused work isn't counted; Missing counts as 0.</li>
        </ul>
      </details>
    </section>
  );
}
