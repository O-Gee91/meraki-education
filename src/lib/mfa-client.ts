import { supabase } from "@/integrations/supabase/client";

/** True when the signed-in account has 2FA but this session hasn't passed it yet. */
export async function needsSecondFactor(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function verifiedTotpFactor() {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === "verified") ?? null;
}
