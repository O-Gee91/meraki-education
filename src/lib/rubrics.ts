export type RubricLevel = {
  label: string;
  /** Lowest points this level can be worth. */
  points: number;
  /** Highest points this level can be worth (same as points when it is a single value). */
  maxPoints?: number;
  descriptor: string;
};

/** Lowest points a level can award. */
export function levelMin(level: RubricLevel): number {
  return Math.min(level.points, level.maxPoints ?? level.points);
}

/** Highest points a level can award. */
export function levelMax(level: RubricLevel): number {
  return Math.max(level.points, level.maxPoints ?? level.points);
}

/** Every point value a teacher can cycle through on a level. */
export function levelOptions(level: RubricLevel): number[] {
  const min = levelMin(level);
  const max = levelMax(level);
  if (max <= min) return [min];
  const out: number[] = [];
  for (let v = min; v <= max + 0.0001 && out.length < 26; v += 1) {
    out.push(Math.round(v * 100) / 100);
  }
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}


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
      const w = Number(c["weight"]);
      return {
        id: String(c["id"] ?? newId()),
        title: String(c["title"] ?? "").slice(0, 160),
        description: String(c["description"] ?? "").slice(0, 600),
        weight: Number.isFinite(w) && w > 0 ? Math.min(20, Math.round(w * 100) / 100) : 1,
        levels: parsedLevels.length ? parsedLevels : blankCriterion().levels,
      };
    })
    .slice(0, 30);
}

/** The multiplier for a row, defaulting to 1 when missing. */
export function criterionWeight(criterion: RubricCriterion): number {
  const w = Number(criterion.weight);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/** Highest level points on the row, before the multiplier. */
export function criterionRawMax(criterion: RubricCriterion): number {
  return criterion.levels.reduce((max, l) => Math.max(max, l.points), 0);
}

/** Highest points the row can contribute, multiplier included. */
export function criterionMax(criterion: RubricCriterion): number {
  return Math.round(criterionRawMax(criterion) * criterionWeight(criterion) * 100) / 100;
}

/** What a chosen level is worth on this row, multiplier included. */
export function criterionEarned(
  criterion: RubricCriterion,
  selections: RubricSelections,
): number {
  const picked = selections[criterion.id];
  if (!Number.isFinite(picked)) return 0;
  return Math.round(Number(picked) * criterionWeight(criterion) * 100) / 100;
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
  const sum = criteria.reduce((acc, c) => acc + criterionEarned(c, selections), 0);
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
