import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Give students another chance after a date change.
 *
 * Clears the recorded marks (either just the zeros, or every mark) for students
 * who have nothing handed in, keeps a copy in grade_reset_log for the record,
 * and optionally messages the students who were reopened. The automatic-zero
 * pass skips anyone with an open reset row, so a reopened student is not
 * immediately scored 0 again.
 */
export const reopenCoursework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        scope: z.enum(["zeros", "all"]).default("zeros"),
        notify: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can reopen coursework");

    const { data: assignment, error: aErr } = await context.supabase
      .from("assignments")
      .select("id, class_id, title, due_date")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assignment) throw new Error("That coursework no longer exists");

    const { data: canManage } = await context.supabase.rpc("can_manage_class", {
      _class_id: assignment.class_id,
    });
    if (!canManage) throw new Error("You do not manage this class");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: assessment } = await supabaseAdmin
      .from("assessments")
      .select("id, closes_at, due_at")
      .eq("assignment_id", assignment.id)
      .maybeSingle();

    const reopenedUntil =
      assessment?.closes_at ??
      assessment?.due_at ??
      (assignment.due_date ? `${assignment.due_date}T23:59:00Z` : null);

    const { data: grades } = await supabaseAdmin
      .from("grades")
      .select("student_id, points_earned, comment")
      .eq("assignment_id", assignment.id);

    // Anyone who already handed something in keeps their work and their mark.
    const submitted = new Set<string>();
    const { data: assignmentSubs } = await supabaseAdmin
      .from("assignment_submissions")
      .select("student_id")
      .eq("assignment_id", assignment.id);
    (assignmentSubs ?? []).forEach((s) => submitted.add(s.student_id));
    if (assessment) {
      const { data: assessmentSubs } = await supabaseAdmin
        .from("assessment_submissions")
        .select("student_id")
        .eq("assessment_id", assessment.id);
      (assessmentSubs ?? []).forEach((s) => submitted.add(s.student_id));
    }

    const targets = (grades ?? []).filter((g) => {
      if (submitted.has(g.student_id)) return false;
      if (g.points_earned == null) return false;
      return data.scope === "all" || Number(g.points_earned) === 0;
    });

    if (targets.length === 0) return { reopened: 0, notified: 0 };

    const { error: logErr } = await supabaseAdmin.from("grade_reset_log").insert(
      targets.map((g) => ({
        class_id: assignment.class_id,
        assignment_id: assignment.id,
        assessment_id: assessment?.id ?? null,
        student_id: g.student_id,
        previous_points: g.points_earned,
        previous_comment: g.comment,
        reason: data.scope === "all" ? "reopened_all" : "reopened_zeros",
        reopened_until: reopenedUntil,
        reset_by: context.userId,
      })),
    );
    if (logErr) throw logErr;

    const { error: delErr } = await supabaseAdmin
      .from("grades")
      .delete()
      .eq("assignment_id", assignment.id)
      .in(
        "student_id",
        targets.map((g) => g.student_id),
      );
    if (delErr) throw delErr;

    let notified = 0;
    if (data.notify) {
      const { data: students } = await supabaseAdmin
        .from("students")
        .select("id, user_id")
        .in(
          "id",
          targets.map((g) => g.student_id),
        );
      const recipients = (students ?? []).filter((s) => s.user_id);
      if (recipients.length > 0) {
        const deadline = reopenedUntil
          ? new Date(reopenedUntil).toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
          : "your teacher's new deadline";
        const { error: msgErr } = await supabaseAdmin.from("messages").insert(
          recipients.map((s) => ({
            sender_id: context.userId,
            recipient_id: s.user_id!,
            subject: `Reopened: ${assignment.title}`,
            body: `Your teacher has reopened "${assignment.title}". Your previous mark has been cleared and you can complete the work by ${deadline}.`,
          })),
        );
        if (!msgErr) notified = recipients.length;
      }
    }

    return { reopened: targets.length, notified };
  });
