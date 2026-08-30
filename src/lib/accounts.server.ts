import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isValidUsername, normalizeUsername, tempPassword, usernameToEmail } from "./usernames";

export type ResetInput = {
  user_id: string;
  new_username?: string | null;
  new_email?: string | null;
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
  }

  const requestedEmail = (input.new_email ?? "").trim().toLowerCase();
  if (requestedEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail) || requestedEmail.length > 255)
      throw new Error("That email address looks invalid");
    const { data: emailTaken } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", requestedEmail)
      .maybeSingle();
    if (emailTaken && emailTaken.id !== input.user_id)
      throw new Error("Another account already uses that email address");
    email = requestedEmail;
  }
  if (!email && !username)
    throw new Error("This account needs a username or an email address");


  const password = tempPassword();
  const signInEmail = username ? usernameToEmail(username) : email;
  const { error: authError } = await admin.auth.admin.updateUserById(input.user_id, {
    password,
    email: signInEmail,
    email_confirm: true,
    user_metadata: {
      ...(username ? { username } : {}),
      ...(email ? { contact_email: email } : {}),
    },

  });
  if (authError) throw new Error(authError.message);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ username, email: email || null })
    .eq("id", input.user_id);
  if (updateError) throw new Error(updateError.message);

  return { username, email, password };

}
