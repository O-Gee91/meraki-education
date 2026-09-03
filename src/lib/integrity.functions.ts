import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Human-readable labels for each automation signal the client can detect. */
const REASONS = {
  webdriver: "browser automation driver detected (navigator.webdriver)",
  automation_global: "automation framework detected in the page",
  synthetic_input: "scripted (non-human) clicks or keystrokes detected",
  console_execution: "custom JavaScript executed on the page",
} as const;

export type IntegrityReason = keyof typeof REASONS;

const NOTE_PREFIX = "Academic integrity: ";
/** One automated strike per account per hour, so a single incident is one strike. */
const COOLDOWN_MINUTES = 60;

/**
 * Students and parents may not script, bot or run code against the platform.
 * When the client detects automation we record a behavior strike on the linked
 * student record(s). Staff accounts are exempt (they legitimately use tooling).
 */
export const reportIntegrityViolation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reason: z.enum([
          "webdriver",
          "automation_global",
          "synthetic_input",
          "console_execution",
        ]),
        detail: z.string().max(500).optional(),
        path: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw roleErr;

    const list = (roles ?? []).map((r) => r.role);
    if (list.includes("admin") || list.includes("teacher")) {
      return { flagged: false, reason: "staff_exempt" as const, strikes: 0 };
    }

    // A parent is flagged through the student record(s) they guard.
    const { data: students, error: sErr } = await supabaseAdmin
      .from("students")
      .select("id")
      .or(`user_id.eq.${context.userId},guardian_user_id.eq.${context.userId}`);
    if (sErr) throw sErr;
    if (!students?.length) {
      return { flagged: false, reason: "no_student_record" as const, strikes: 0 };
    }

    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
    const { data: recent, error: rErr } = await supabaseAdmin
      .from("behavior_notes")
      .select("id, student_id")
      .in(
        "student_id",
        students.map((s) => s.id),
      )
      .eq("kind", "strike")
      .gte("created_at", since)
      .like("notes", `${NOTE_PREFIX}%`);
    if (rErr) throw rErr;

    const cooling = new Set((recent ?? []).map((r) => r.student_id));
    const targets = students.filter((s) => !cooling.has(s.id));
    if (!targets.length) {
      return { flagged: false, reason: "cooldown" as const, strikes: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const notes =
      `${NOTE_PREFIX}${REASONS[data.reason as IntegrityReason]}` +
      (data.path ? ` on ${data.path}` : "") +
      (data.detail ? ` — ${data.detail}` : "") +
      ". Scripting, botting and running code are not permitted for students or guardians.";

    const { error: insErr } = await supabaseAdmin.from("behavior_notes").insert(
      targets.map((s) => ({
        student_id: s.id,
        date: today,
        kind: "strike",
        severity: 3,
        notes,
      })),
    );
    if (insErr) throw insErr;

    return { flagged: true, reason: data.reason, strikes: targets.length };
  });
