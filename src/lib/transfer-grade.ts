import { supabase } from "@/integrations/supabase/client";
import { computeAverage, markCodeFromComment, parseGradingSetup, TRANSFER_CATEGORY } from "@/lib/grading";

/** Points possible on a carried-over transfer grade; earned points equal the old class percentage. */
export const TRANSFER_POINTS = 100;
export { TRANSFER_CATEGORY };

export function transferTitle(fromClassName: string) {
  return `Transfer grade · ${fromClassName}`;
}

/** Earned points for the transfer entry: the old class percentage, rounded to 0.1. */
export function transferPoints(percent: number | null): number | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  return Math.round(percent * 10) / 10;
}

/**
 * Adds one posted "Transfer grade" entry in each target class carrying the
 * student's overall percentage from the class they are leaving.
 * Returns how many entries were written.
 */
export async function carryTransferGrades(fromClassId: string, studentIds: string[], targetClassIds: string[]) {
  if (!studentIds.length || !targetClassIds.length) return 0;
  const { data: from } = await supabase.from("classes").select("name, weights").eq("id", fromClassId).single();
  if (!from) return 0;
  const setup = parseGradingSetup(from.weights);
  const { data: items } = await supabase
    .from("assignments")
    .select("id, category, points_possible")
    .eq("class_id", fromClassId)
    .eq("status", "published");
  const ids = (items ?? []).map((a) => a.id);
  const { data: grades } = ids.length
    ? await supabase
        .from("grades")
        .select("assignment_id, student_id, points_earned, comment")
        .in("assignment_id", ids)
        .in("student_id", studentIds)
        .eq("is_draft", false)
    : { data: [] };

  const title = transferTitle(from.name);
  let written = 0;
  for (const classId of targetClassIds) {
    const { data: existing } = await supabase
      .from("assignments").select("id").eq("class_id", classId).eq("title", title).maybeSingle();
    let assignmentId = existing?.id;
    if (!assignmentId) {
      const { data: created, error } = await supabase
        .from("assignments")
        .insert({ class_id: classId, title, category: TRANSFER_CATEGORY, points_possible: TRANSFER_POINTS, status: "published", description: `Overall grade carried over from ${from.name}.` })
        .select("id").single();
      if (error || !created) continue;
      assignmentId = created.id;
    }
    for (const sid of studentIds) {
      const mine = (grades ?? []).filter((g) => g.student_id === sid);
      const pct = computeAverage(
        (items ?? []).map((a) => {
          const g = mine.find((x) => x.assignment_id === a.id);
          return { category: a.category, pointsPossible: Number(a.points_possible), pointsEarned: g?.points_earned == null ? null : Number(g.points_earned), markCode: markCodeFromComment(g?.comment) };
        }),
        setup,
      );
      const points = transferPoints(pct);
      if (points == null) continue;
      const { error } = await supabase.from("grades").upsert(
        { assignment_id: assignmentId, student_id: sid, points_earned: points, is_draft: false, posted_at: new Date().toISOString() },
        { onConflict: "assignment_id,student_id" },
      );
      if (!error) written++;
    }
  }
  return written;
}
