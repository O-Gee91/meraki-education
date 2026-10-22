import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  kind: "assignment" | "assessment";
  ids: string[];
  students: boolean;
  parents: boolean;
};

/**
 * Emails enrolled students and/or their guardians that a piece of coursework was posted.
 * Only staff who can manage the class may trigger it; test accounts are skipped.
 */
export const notifyCourseworkPosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (input?.kind !== "assignment" && input?.kind !== "assessment") throw new Error("Invalid kind");
    if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 20)
      throw new Error("Invalid ids");
    return { kind: input.kind, ids: input.ids.map(String), students: !!input.students, parents: !!input.parents };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let students = 0;
    let parents = 0;
    if (!data.students && !data.parents) return { students, parents };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const origin = process.env["PUBLIC_SITE_URL"] ?? "https://meraki-education.app";

    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();

    for (const id of data.ids) {
      const item =
        data.kind === "assignment"
          ? await supabaseAdmin
              .from("assignments")
              .select("id, title, class_id, due_date, description, status")
              .eq("id", id)
              .maybeSingle()
              .then((r) =>
                r.data && r.data.status === "published"
                  ? { ...r.data, due: r.data.due_date, desc: r.data.description }
                  : null,
              )
          : await supabaseAdmin
              .from("assessments")
              .select("id, title, class_id, due_at, instructions, published")
              .eq("id", id)
              .maybeSingle()
              .then((r) =>
                r.data && r.data.published ? { ...r.data, due: r.data.due_at, desc: r.data.instructions } : null,
              );
      if (!item) continue;

      const { data: allowed } = await supabase.rpc("can_manage_class", { _class_id: item.class_id });
      if (!allowed) continue;

      const { data: cls } = await supabaseAdmin.from("classes").select("name").eq("id", item.class_id).maybeSingle();
      const { data: enr } = await supabaseAdmin
        .from("enrollments")
        .select("students(id, first_name, last_name, user_id, guardian_user_id, guardian_email, is_tester)")
        .eq("class_id", item.class_id);
      const roster = (enr ?? [])
        .map((e) => e.students as unknown as {
          id: string; first_name: string; last_name: string; user_id: string | null;
          guardian_user_id: string | null; guardian_email: string | null; is_tester: boolean;
        } | null)
        .filter((s): s is NonNullable<typeof s> => !!s && !s.is_tester);

      const profileIds = roster.flatMap((s) => [s.user_id, s.guardian_user_id]).filter((x): x is string => !!x);
      const { data: profiles } = profileIds.length
        ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", profileIds)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

      const dueText = item.due
        ? new Date(item.due.length <= 10 ? `${item.due}T12:00:00Z` : item.due).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })
        : undefined;
      const base = {
        kindLabel: data.kind,
        title: item.title,
        className: cls?.name ?? undefined,
        teacherName: me?.full_name ?? undefined,
        dueText,
        description: item.desc ? String(item.desc).slice(0, 600) : undefined,
        openUrl: `${origin}/classes/${item.class_id}`,
      };
      const valid = (e?: string | null) => !!e && e.includes("@") && !e.endsWith(".local");
      const send = async (to: string, key: string, extra: Record<string, unknown>) => {
        try {
          const r = await sendTemplateEmail("coursework-posted", to, {
            templateData: { ...base, ...extra },
            idempotencyKey: `coursework-posted-${data.kind}-${item.id}-${key}`,
          });
          return r.sent;
        } catch (err) {
          console.error("coursework notification failed", err);
          return false;
        }
      };

      for (const s of roster) {
        const name = `${s.first_name} ${s.last_name}`.trim();
        if (data.students && s.user_id) {
          const p = byId.get(s.user_id);
          if (valid(p?.email) && (await send(p!.email!, `s-${s.id}`, { recipientName: s.first_name }))) students++;
        }
        if (data.parents) {
          const g = s.guardian_user_id ? byId.get(s.guardian_user_id) : undefined;
          const email = valid(g?.email) ? g!.email! : valid(s.guardian_email) ? s.guardian_email! : null;
          if (email && (await send(email, `g-${s.id}`, {
            recipientName: g?.full_name ?? undefined, isGuardian: true, studentName: name,
          }))) parents++;
        }
      }
    }
    return { students, parents };
  });
