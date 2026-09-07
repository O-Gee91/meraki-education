export type RubricLevel = {
  label: string;
  points: number;
  descriptor: string;
};

export type RubricCriterion = {
  id: string;
  title: string;
  description: string;
  /** How much this row counts, e.g. 2 makes it worth double. */
  weight: number;
  levels: RubricLevel[];
};

export type RubricRow = {
  id: string;
  class_id: string | null;
  title: string;
  description: string | null;
  grade_level: number | null;
  subject: string | null;
  criteria: unknown;
  total_points: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RubricSelections = Record<string, number>;

export const DEFAULT_LEVEL_LABELS = ["Exceeds", "Meets", "Approaching", "Beginning"] as const;

function newId() {
  return `c${Math.random().toString(36).slice(2, 10)}`;
}

export function blankCriterion(points = 4): RubricCriterion {
  return {
    id: newId(),
    title: "",
    description: "",
    weight: 1,
    levels: DEFAULT_LEVEL_LABELS.map((label, i) => ({
      label,
      points: Math.max(0, points - i),
      descriptor: "",
    })),
  };
}

export function blankRubricCriteria(): RubricCriterion[] {
  return [blankCriterion(), blankCriterion()];
}

/** Normalise anything stored in the database into a usable rubric. */
export function parseCriteria(value: unknown): RubricCriterion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const levels = Array.isArray(c["levels"]) ? (c["levels"] as unknown[]) : [];
      const parsedLevels: RubricLevel[] = levels
        .map((l) => {
          const lv = (l ?? {}) as Record<string, unknown>;
          const pts = Number(lv["points"]);
          return {
            label: String(lv["label"] ?? "").slice(0, 60) || "Level",
            points: Number.isFinite(pts) ? Math.max(0, Math.round(pts * 100) / 100) : 0,
            descriptor: String(lv["descriptor"] ?? "").slice(0, 600),
          };
        })
        .slice(0, 8);
      return {
        id: String(c["id"] ?? newId()),
        title: String(c["title"] ?? "").slice(0, 160),
        description: String(c["description"] ?? "").slice(0, 600),
        levels: parsedLevels.length ? parsedLevels : blankCriterion().levels,
      };
    })
    .slice(0, 30);
}

export function criterionMax(criterion: RubricCriterion): number {
  return criterion.levels.reduce((max, l) => Math.max(max, l.points), 0);
}

export function rubricTotal(criteria: RubricCriterion[]): number {
  return Math.round(criteria.reduce((sum, c) => sum + criterionMax(c), 0) * 100) / 100;
}

export function parseSelections(value: unknown): RubricSelections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: RubricSelections = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

export function selectionsTotal(
  criteria: RubricCriterion[],
  selections: RubricSelections,
): number {
  const sum = criteria.reduce((acc, c) => acc + (selections[c.id] ?? 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Convert a rubric total into the points of a gradebook column. */
export function scaleToAssignment(
  earned: number,
  rubricMax: number,
  assignmentPoints: number,
): number {
  if (rubricMax <= 0) return 0;
  return Math.round((earned / rubricMax) * assignmentPoints * 100) / 100;
}
