import { supabase } from "@/integrations/supabase/client";
import { passkeyStatus } from "@/lib/passkey.functions";

/** True when the signed-in account has 2FA but this session hasn't passed it yet. */
export async function needsSecondFactor(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  const totpPending = data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  let pk = { has: false, verified: false };
  try {
    pk = await passkeyStatus();
  } catch {
    // Without a status answer fall back to the authenticator rule alone.
  }
  if (pk.verified) return false;
  return totpPending || pk.has;
}

export async function verifiedTotpFactor() {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === "verified") ?? null;
}
