import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EarlierWorkClass = {
  classId: string;
  name: string;
  droppedAt: string;
  assignments: { id: string; title: string; category: string; points_possible: number; due_date: string | null }[];
  grades: { assignment_id: string; points_earned: number | null; comment: string | null }[];
};

/** Earlier-class work for a student the caller currently teaches (posted grades only). */
export const getStudentEarlierWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string; excludeClassId: string }) => {
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(input?.studentId ?? "") || !uuid.test(input?.excludeClassId ?? "")) throw new Error("Invalid input");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ classes: EarlierWorkClass[] }> => {
    const { data: allowed, error: rpcErr } = await context.supabase.rpc("can_manage_student", { _student_id: data.studentId });
    if (rpcErr || !allowed) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drops, error } = await supabaseAdmin
      .from("dropped_enrollments")
      .select("class_id, dropped_at, classes(name)")
      .eq("student_id", data.studentId)
      .neq("class_id", data.excludeClassId);
    if (error) throw new Error("Could not load earlier work");
    if (!drops?.length) return { classes: [] };
    const ids = drops.map((d) => d.class_id);
    const { data: items } = await supabaseAdmin
      .from("assignments")
      .select("id, class_id, title, category, points_possible, due_date")
      .in("class_id", ids)
      .eq("status", "published");
    const itemIds = (items ?? []).map((a) => a.id);
    const { data: marks } = itemIds.length
      ? await supabaseAdmin
          .from("grades")
          .select("assignment_id, points_earned, comment")
          .eq("student_id", data.studentId)
          .eq("is_draft", false)
          .in("assignment_id", itemIds)
      : { data: [] };
    return {
      classes: drops.map((d) => ({
        classId: d.class_id,
        name: (d.classes as { name?: string } | null)?.name ?? "Previous class",
        droppedAt: d.dropped_at,
        assignments: (items ?? [])
          .filter((a) => a.class_id === d.class_id)
          .map((a) => ({ id: a.id, title: a.title, category: a.category, points_possible: Number(a.points_possible), due_date: a.due_date })),
        grades: (marks ?? []).map((g) => ({ assignment_id: g.assignment_id, points_earned: g.points_earned == null ? null : Number(g.points_earned), comment: g.comment })),
      })),
    };
  });
