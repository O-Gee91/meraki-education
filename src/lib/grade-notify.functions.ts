import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Emails each student (and their guardian) privately when their grade is posted.
 * Only staff who manage the class may trigger it; drafts and test accounts are skipped.
 */
export const notifyGradesPosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignmentId: string; studentIds: string[] }) => {
    if (!input?.assignmentId || !Array.isArray(input.studentIds) || input.studentIds.length > 300)
      throw new Error("Invalid input");
    return { assignmentId: String(input.assignmentId), studentIds: input.studentIds.map(String) };
  })
  .handler(async ({ data, context }) => {
    let students = 0;
    let parents = 0;
    if (!data.studentIds.length) return { students, parents };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const origin = process.env["PUBLIC_SITE_URL"] ?? "https://meraki-education.app";

    const { data: a } = await supabaseAdmin
      .from("assignments")
      .select("id, title, class_id, points_possible")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (!a) return { students, parents };
    const { data: allowed } = await context.supabase.rpc("can_manage_class", { _class_id: a.class_id });
    if (!allowed) throw new Error("Forbidden");

    const { data: cls } = await supabaseAdmin.from("classes").select("name").eq("id", a.class_id).maybeSingle();
    const { data: grades } = await supabaseAdmin
      .from("grades")
      .select("id, student_id, points_earned, comment, is_draft, posted_at")
      .eq("assignment_id", a.id)
      .in("student_id", data.studentIds);
    const { data: roster } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, user_id, guardian_user_id, guardian_email, is_tester")
      .in("id", data.studentIds);
    const profileIds = (roster ?? []).flatMap((s) => [s.user_id, s.guardian_user_id]).filter((x): x is string => !!x);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", profileIds)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const valid = (e?: string | null) => !!e && e.includes("@") && !e.endsWith(".local");

    for (const g of grades ?? []) {
      if (g.is_draft) continue;
      const s = (roster ?? []).find((r) => r.id === g.student_id);
      if (!s || s.is_tester) continue;
      const mark = g.comment?.startsWith("MARK:") ? g.comment.slice(5) : null;
      const base = {
        title: a.title,
        className: cls?.name ?? undefined,
        scoreText: mark ?? (g.points_earned != null ? `${g.points_earned} / ${a.points_possible}` : undefined),
        feedback: !mark && g.comment ? String(g.comment).slice(0, 600) : undefined,
        openUrl: `${origin}/assignments`,
      };
      const stamp = g.posted_at ?? "";
      const send = async (to: string, key: string, extra: Record<string, unknown>) => {
        try {
          const r = await sendTemplateEmail("grade-posted", to, {
            templateData: { ...base, ...extra },
            idempotencyKey: `grade-posted-${g.id}-${stamp}-${key}`,
          });
          return r.sent;
        } catch (err) {
          console.error("grade notification failed", err);
          return false;
        }
      };
      const p = s.user_id ? byId.get(s.user_id) : undefined;
      if (valid(p?.email) && (await send(p!.email!, "s", { recipientName: s.first_name }))) students++;
      const gp = s.guardian_user_id ? byId.get(s.guardian_user_id) : undefined;
      const ge = valid(gp?.email) ? gp!.email! : valid(s.guardian_email) ? s.guardian_email! : null;
      if (ge && (await send(ge, "g", {
        recipientName: gp?.full_name ?? undefined, isGuardian: true,
        studentName: `${s.first_name} ${s.last_name}`.trim(),
      }))) parents++;
    }
    return { students, parents };
  });
