import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guessDeviceName, resolveRelyingParty } from "@/lib/passkey-rp";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function party() {
  const rp = resolveRelyingParty(getRequestHeader("origin") ?? getRequestHeader("referer"));
  if (!rp) throw new Error("Passkeys aren't available on this site address.");
  return rp;
}

function sessionId(claims: unknown): string {
  const id = (claims as { session_id?: string }).session_id;
  console.log("PKDEBUG claims keys", Object.keys(claims as object));
  if (!id) throw new Error("Session not found");
  return id;
}

async function takeChallenge(userId: string, kind: string): Promise<string | null> {
  const sb = await admin();
  const { data } = await sb
    .from("webauthn_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb.from("webauthn_challenges").delete().eq("user_id", userId).eq("kind", kind);
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.challenge;
}

async function saveChallenge(userId: string, kind: string, challenge: string) {
  const sb = await admin();
  await sb.from("webauthn_challenges").delete().eq("user_id", userId).eq("kind", kind);
  await sb.from("webauthn_challenges").insert({ user_id: userId, kind, challenge });
}

/** Whether this account uses passkeys and whether this sign-in already passed one. */
export const passkeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { count } = await sb
      .from("passkey_credentials")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const sid = (context.claims as { session_id?: string }).session_id;
    let verified = false;
    if (sid && count) {
      const { data } = await sb.from("passkey_sessions").select("session_id").eq("session_id", sid).eq("user_id", context.userId).maybeSingle();
      verified = !!data;
    }
    return { has: (count ?? 0) > 0, verified };
  });

export const passkeyRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const sb = await admin();
    const rp = party();
    const [{ data: profile }, { data: existing }] = await Promise.all([
      sb.from("profiles").select("full_name, email, username").eq("id", context.userId).maybeSingle(),
      sb.from("passkey_credentials").select("credential_id, transports").eq("user_id", context.userId),
    ]);
    const options = await generateRegistrationOptions({
      rpName: "Meraki Education",
      rpID: rp.rpID,
      userName: profile?.username || profile?.email || context.userId,
      userDisplayName: profile?.full_name || "Meraki user",
      userID: new TextEncoder().encode(context.userId),
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: c.transports as never })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    await saveChallenge(context.userId, "register", options.challenge);
    return { optionsJson: JSON.stringify(options) };
  });

export const verifyPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { response: string; deviceName?: string }) =>
    z.object({ response: z.string().max(20000), deviceName: z.string().max(60).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const rp = party();
    const expected = await takeChallenge(context.userId, "register");
    if (!expected) return { ok: false as const, message: "That took too long. Please try again." };
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: JSON.parse(data.response) as never,
        expectedChallenge: expected,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
      });
    } catch {
      return { ok: false as const, message: "This device couldn't be added. Try again." };
    }
    if (!result.verified || !result.registrationInfo) return { ok: false as const, message: "This device couldn't be added." };
    const { credential, credentialBackedUp } = result.registrationInfo;
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const sb = await admin();
    const { error } = await sb.from("passkey_credentials").insert({
      user_id: context.userId,
      credential_id: credential.id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      backed_up: credentialBackedUp,
      device_name: data.deviceName?.trim() || guessDeviceName(getRequestHeader("user-agent") ?? ""),
    });
    if (error) return { ok: false as const, message: "This device is already added." };
    // The person just proved it's them on this device, so this sign-in counts as verified.
    const up = await sb.from("passkey_sessions").upsert({ session_id: sessionId(context.claims), user_id: context.userId });
    console.log("PKDEBUG upsert", up.error);
    return { ok: true as const };
  });

export const passkeyAuthOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const sb = await admin();
    const rp = party();
    const { data: creds } = await sb.from("passkey_credentials").select("credential_id, transports").eq("user_id", context.userId);
    if (!creds?.length) throw new Error("No passkeys on this account");
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: "preferred",
      allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: c.transports as never })),
    });
    await saveChallenge(context.userId, "auth", options.challenge);
    return { optionsJson: JSON.stringify(options) };
  });

export const verifyPasskeyAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { response: string }) => z.object({ response: z.string().max(20000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const rp = party();
    const expected = await takeChallenge(context.userId, "auth");
    if (!expected) return { ok: false as const, message: "That took too long. Please try again." };
    const sb = await admin();
    const credId = String((JSON.parse(data.response) as { id?: string }).id ?? "");
    const { data: cred } = await sb
      .from("passkey_credentials")
      .select("id, credential_id, public_key, counter, transports")
      .eq("user_id", context.userId)
      .eq("credential_id", credId)
      .maybeSingle();
    if (!cred) return { ok: false as const, message: "This passkey isn't linked to your account." };
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: JSON.parse(data.response) as never,
        expectedChallenge: expected,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
        credential: {
          id: cred.credential_id,
          publicKey: isoBase64URL.toBuffer(cred.public_key),
          counter: Number(cred.counter),
          transports: cred.transports as never,
        },
      });
    } catch {
      return { ok: false as const, message: "That didn't work. Try again." };
    }
    if (!result.verified) return { ok: false as const, message: "That didn't work. Try again." };
    await sb
      .from("passkey_credentials")
      .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", cred.id);
    await sb.from("passkey_sessions").upsert({ session_id: sessionId(context.claims), user_id: context.userId });
    return { ok: true as const };
  });
