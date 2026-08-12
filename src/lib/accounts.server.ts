import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isValidUsername, normalizeUsername, tempPassword, usernameToEmail } from "./usernames";

export type ResetInput = {
  user_id: string;
  new_username?: string | null;
};

export type ResetResult = {
  username: string | null;
  email: string;
  password: string;
};

export async function resetAccountAccess(
  admin: SupabaseClient<Database>,
  input: ResetInput,
  actor: { userId: string; isAdmin: boolean },
): Promise<ResetResult> {
  if (input.user_id === actor.userId)
    throw new Error("Use your own account settings to change your password");

  const { data: targetRoles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", input.user_id);
  if (rolesError) throw new Error(rolesError.message);

  const roles = (targetRoles ?? []).map((r) => r.role);
  const isStaffTarget = roles.includes("admin") || roles.includes("teacher");
  if (isStaffTarget && !actor.isAdmin)
    throw new Error("Only administrators can reset staff accounts");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username, email")
    .eq("id", input.user_id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Account not found");

  const requested = normalizeUsername(input.new_username ?? "");
  let username = profile.username ?? null;
  let email = profile.email ?? "";

  if (requested && requested !== username) {
    if (!isValidUsername(requested)) throw new Error("That username is not allowed");
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("username", requested)
      .maybeSingle();
    if (taken && taken.id !== input.user_id) throw new Error("That username is already taken");
    username = requested;
    if (!email || email.endsWith("@meraki.local")) email = usernameToEmail(requested);
  }

  const password = tempPassword();
  const { error: authError } = await admin.auth.admin.updateUserById(input.user_id, {
    password,
    email,
    email_confirm: true,
    ...(username ? { user_metadata: { username } } : {}),
  });
  if (authError) throw new Error(authError.message);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ username, email })
    .eq("id", input.user_id);
  if (updateError) throw new Error(updateError.message);

  return { username, email, password };
}
