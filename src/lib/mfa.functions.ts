import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BACKUP_CODE_COUNT,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  generateBackupCode,
  generateEmailCode,
  hashCode,
  isEmailCodeUsable,
} from "@/lib/mfa-codes";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function removeAllFactors(userId: string) {
  const sb = await admin();
  const { data } = await sb.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) {
    await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }
  await sb.from("mfa_backup_codes").delete().eq("user_id", userId);
  await sb.from("mfa_email_codes").delete().eq("user_id", userId);
}

/** Creates a fresh set of backup codes. Only callable after passing 2FA (aal2). */
export const regenerateBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") throw new Error("Verify your authenticator first");
    const sb = await admin();
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    const rows = await Promise.all(
      codes.map(async (c) => ({ user_id: context.userId, code_hash: await hashCode(c) })),
    );
    await sb.from("mfa_backup_codes").delete().eq("user_id", context.userId);
    const { error } = await sb.from("mfa_backup_codes").insert(rows);
    if (error) throw new Error("Could not save backup codes");
    return { codes };
  });

export const backupCodesRemaining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { count } = await sb
      .from("mfa_backup_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("used_at", null);
    return { remaining: count ?? 0 };
  });

/** Clears backup codes after the user turns 2FA off themselves. */
export const clearMyMfaCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data } = await sb.auth.admin.mfa.listFactors({ userId: context.userId });
    if ((data?.factors ?? []).some((f) => f.status === "verified")) return { ok: false };
    await sb.from("mfa_backup_codes").delete().eq("user_id", context.userId);
    await sb.from("mfa_email_codes").delete().eq("user_id", context.userId);
    return { ok: true };
  });

/**
 * Recovery with a backup code. On success the authenticator is removed so the
 * user can continue signed in and set it up again.
 */
export const recoverWithBackupCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ code: z.string().min(6).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const hash = await hashCode(data.code);
    const { data: row } = await sb
      .from("mfa_backup_codes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();
    if (!row) return { ok: false as const, message: "That backup code didn't work." };
    await sb.from("mfa_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    await removeAllFactors(context.userId);
    return { ok: true as const };
  });

export const sendMfaEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data: recent } = await sb
      .from("mfa_email_codes")
      .select("created_at")
      .eq("user_id", context.userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent && recent.length) return { ok: false as const, message: "Please wait a minute before asking for another code." };
    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const to = profile?.email;
    if (!to || to.endsWith("@meraki.local")) {
      return { ok: false as const, message: "No email address is on file for this account. Ask an administrator for help." };
    }
    const code = generateEmailCode();
    await sb.from("mfa_email_codes").delete().eq("user_id", context.userId);
    await sb.from("mfa_email_codes").insert({
      user_id: context.userId,
      code_hash: await hashCode(code),
      expires_at: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
    });
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("mfa-code", to, {
      templateData: { recipientName: profile?.full_name ?? undefined, code },
    }).catch(() => undefined);
    const [name, domain] = to.split("@");
    return { ok: true as const, sentTo: `${name.slice(0, 2)}•••@${domain}` };
  });

export const recoverWithEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: row } = await sb
      .from("mfa_email_codes")
      .select("id, code_hash, expires_at, attempts, used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row || !isEmailCodeUsable(row)) {
      return { ok: false as const, message: "That code has expired. Send a new one." };
    }
    if (row.code_hash !== (await hashCode(data.code))) {
      await sb.from("mfa_email_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      const left = EMAIL_CODE_MAX_ATTEMPTS - row.attempts - 1;
      return { ok: false as const, message: left > 0 ? `That code didn't match. ${left} tries left.` : "Too many tries. Send a new code." };
    }
    await removeAllFactors(context.userId);
    return { ok: true as const };
  });

/** Admin: see which accounts have 2FA on (true/false only). */
export const listMfaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("staff_mfa_status");
    if (error) throw new Error("Could not load 2FA status");
    return { enabled: (data ?? []).filter((r) => r.enabled).map((r) => r.user_id) };
  });

/** Admin: clear a locked-out person's 2FA and tell them by email. */
export const adminResetMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Only administrators can reset two-step verification");
    await removeAllFactors(data.userId);
    const sb = await admin();
    const { data: profile } = await sb.from("profiles").select("full_name, email").eq("id", data.userId).maybeSingle();
    if (profile?.email && !profile.email.endsWith("@meraki.local")) {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("mfa-code", profile.email, {
        templateData: { recipientName: profile.full_name ?? undefined, reset: true },
      }).catch(() => undefined);
    }
    return { ok: true };
  });
