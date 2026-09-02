export type GradeScaleBand = { letter: string; min: number };
export type SpecialMark = {
  code: string;
  label: string;
  /** exclude = not counted, zero = counted as 0, value = counted as % of points */
  behavior: "exclude" | "zero" | "value";
  value?: number;
};
export type CategoryWeight = { name: string; weight: number };
/** One-click score a teacher can apply to a gradebook cell. */
export type QuickScore = {
  label: string;
  /** percent = % of the assignment's points, points = raw points, mark = special mark code */
  kind: "percent" | "points" | "mark";
  value: number | string;
};

export type GradingSetup = {
  mode: "unweighted" | "weighted";
  categories: CategoryWeight[];
  scale: GradeScaleBand[];
  marks: SpecialMark[];
  quickScores: QuickScore[];
};

export const DEFAULT_SCALE: GradeScaleBand[] = [
  { letter: "A", min: 90 },
  { letter: "B", min: 80 },
  { letter: "C", min: 70 },
  { letter: "D", min: 60 },
  { letter: "F", min: 0 },
];

export const DEFAULT_MARKS: SpecialMark[] = [
  { code: "M", label: "Missing", behavior: "zero" },
  { code: "EX", label: "Exempt / excused", behavior: "exclude" },
  { code: "INC", label: "Incomplete", behavior: "exclude" },
  { code: "L", label: "Late (half credit)", behavior: "value", value: 50 },
];

export const DEFAULT_QUICK_SCORES: QuickScore[] = [
  { label: "Full credit", kind: "percent", value: 100 },
  { label: "Great (90%)", kind: "percent", value: 90 },
  { label: "Proficient (80%)", kind: "percent", value: 80 },
  { label: "Half credit", kind: "percent", value: 50 },
  { label: "Zero", kind: "points", value: 0 },
  { label: "Missing", kind: "mark", value: "M" },
  { label: "Excused", kind: "mark", value: "EX" },
];

export const DEFAULT_CATEGORIES: CategoryWeight[] = [
  { name: "Homework", weight: 20 },
  { name: "Quiz", weight: 20 },
  { name: "Test", weight: 40 },
  { name: "Project", weight: 15 },
  { name: "Participation", weight: 5 },
];

export const DEFAULT_SETUP: GradingSetup = {
  mode: "unweighted",
  categories: DEFAULT_CATEGORIES,
  scale: DEFAULT_SCALE,
  marks: DEFAULT_MARKS,
  quickScores: DEFAULT_QUICK_SCORES,
};

export function parseGradingSetup(raw: unknown): GradingSetup {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawCategories = obj["categories"];
  const rawScale = obj["scale"];
  const rawMarks = obj["marks"];
  const categories = Array.isArray(rawCategories)
    ? (rawCategories as CategoryWeight[]).filter((c) => c && typeof c.name === "string")
    : DEFAULT_CATEGORIES;
  const scale =
    Array.isArray(rawScale) && rawScale.length
      ? [...(rawScale as GradeScaleBand[])].sort((a, b) => Number(b.min) - Number(a.min))
      : DEFAULT_SCALE;
  const marks = Array.isArray(rawMarks) ? (rawMarks as SpecialMark[]) : DEFAULT_MARKS;
  const rawQuick = obj["quickScores"];
  const quickScores = Array.isArray(rawQuick)
    ? (rawQuick as QuickScore[]).filter((q) => q && typeof q.label === "string")
    : DEFAULT_QUICK_SCORES;
  return {
    mode: obj["mode"] === "weighted" ? "weighted" : "unweighted",
    categories: categories.length ? categories : DEFAULT_CATEGORIES,
    scale,
    marks,
    quickScores,
  };
}

/** Turns a quick score into the raw cell text the gradebook understands. */
export function quickScoreCellValue(q: QuickScore, pointsPossible: number) {
  if (q.kind === "mark") return String(q.value).toUpperCase();
  if (q.kind === "points") return String(Number(q.value) || 0);
  const pts = (Number(q.value) / 100) * Number(pointsPossible || 0);
  return String(Math.round(pts * 100) / 100);
}

export function letterFor(pct: number, scale: GradeScaleBand[]) {
  const sorted = [...scale].sort((a, b) => Number(b.min) - Number(a.min));
  for (const band of sorted) {
    if (pct >= Number(band.min)) return band.letter;
  }
  return sorted.at(-1)?.letter ?? "—";
}

export function markCodeFromComment(comment?: string | null) {
  if (!comment) return null;
  const match = /^MARK:([A-Za-z0-9+-]{1,6})/.exec(comment.trim());
  return match?.[1] ? match[1].toUpperCase() : null;
}

export function findMark(code: string | null, marks: SpecialMark[]) {
  if (!code) return null;
  return marks.find((m) => m.code.toUpperCase() === code.toUpperCase()) ?? null;
}

type ScoreInput = {
  category: string;
  pointsPossible: number;
  pointsEarned: number | null;
  markCode: string | null;
};

/** Category name reserved for bonus work: points earned add on top, nothing counts against. */
export const EXTRA_CREDIT_CATEGORY = "Extra credit";

export function isExtraCredit(category?: string | null) {
  return (category ?? "").trim().toLowerCase() === EXTRA_CREDIT_CATEGORY.toLowerCase();
}

/** Returns the class percentage for one student, honoring weights and special marks. */
export function computeAverage(rows: ScoreInput[], setup: GradingSetup): number | null {
  const buckets = new Map<string, { earned: number; possible: number }>();
  let bonusEarned = 0;
  let bonusPossible = 0;

  for (const row of rows) {
    const mark = findMark(row.markCode, setup.marks);
    let earned: number | null = row.pointsEarned;

    if (mark) {
      if (mark.behavior === "exclude") continue;
      if (mark.behavior === "zero") earned = 0;
      if (mark.behavior === "value") {
        earned = (Number(mark.value ?? 0) / 100) * Number(row.pointsPossible);
      }
    }
    if (earned == null) continue;

    if (isExtraCredit(row.category)) {
      bonusEarned += Number(earned);
      bonusPossible += Number(row.pointsPossible);
      continue;
    }

    const key = setup.mode === "weighted" ? row.category : "__all__";
    const bucket = buckets.get(key) ?? { earned: 0, possible: 0 };
    bucket.earned += Number(earned);
    bucket.possible += Number(row.pointsPossible);
    buckets.set(key, bucket);
  }

  if (setup.mode !== "weighted") {
    const all = buckets.get("__all__");
    if (!all || !all.possible) return bonusEarned && bonusPossible ? 100 : null;
    return ((all.earned + bonusEarned) / all.possible) * 100;
  }


  let weighted = 0;
  let usedWeight = 0;
  for (const cat of setup.categories) {
    const bucket = buckets.get(cat.name);
    if (!bucket || !bucket.possible) continue;
    const pct = (bucket.earned / bucket.possible) * 100;
    weighted += pct * Number(cat.weight || 0);
    usedWeight += Number(cat.weight || 0);
  }
  // Categories not listed in the setup fall back to raw points so nothing is lost.
  const leftovers = [...buckets.entries()].filter(
    ([name]) => !setup.categories.some((c) => c.name === name),
  );
  if (leftovers.length) {
    const earned = leftovers.reduce((sum, [, b]) => sum + b.earned, 0);
    const possible = leftovers.reduce((sum, [, b]) => sum + b.possible, 0);
    if (possible) {
      const share = Math.max(0, 100 - usedWeight) || 0;
      if (share > 0) {
        weighted += (earned / possible) * 100 * share;
        usedWeight += share;
      }
    }
  }
  if (!usedWeight) return bonusEarned && bonusPossible ? 100 : null;
  // Bonus work lifts the final percentage without ever lowering it.
  const bonusLift = bonusPossible ? (bonusEarned / bonusPossible) * 100 : 0;
  const totalPossible = [...buckets.values()].reduce((s, b) => s + b.possible, 0);
  const bonusShare = totalPossible ? (bonusEarned / totalPossible) * 100 : bonusLift;
  return weighted / usedWeight + bonusShare;
}

export function totalWeight(categories: CategoryWeight[]) {
  return categories.reduce((sum, c) => sum + Number(c.weight || 0), 0);
}
