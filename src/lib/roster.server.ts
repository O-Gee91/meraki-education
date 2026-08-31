import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  isValidUsername,
  normalizeUsername,
  tempPassword,
  usernameToEmail,
} from "./usernames";

export type ProvisionEntry = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_email?: string | null;
  guardian_email?: string | null;
  student_username?: string | null;
  guardian_username?: string | null;
  /** Issue a fresh temporary password for accounts that already exist. */
  reset_existing?: boolean;
};

export type ProvisionedAccount = {
  student: string;
  role: "student" | "parent";
  username: string | null;
  email: string;
  password: string | null;
  status: "created" | "linked" | "failed";
  detail?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findUserIdByEmail(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

async function findUserIdByUsername(
  admin: SupabaseClient<Database>,
  username: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return data?.id ?? null;
}

type Target = {
  role: "student" | "parent";
  username: string | null;
  /** The address used to sign in (synthetic when a username is used). */
  email: string;
  /** The person's real inbox, when known. Empty means they register it at first sign-in. */
  contactEmail: string;
};

export async function provisionRosterAccounts(
  admin: SupabaseClient<Database>,
  entries: ProvisionEntry[],
): Promise<ProvisionedAccount[]> {
  const results: ProvisionedAccount[] = [];

  for (const entry of entries.slice(0, 200)) {
    const name = `${entry.first_name} ${entry.last_name}`.trim();
    const targets: Target[] = [];

    const studentUsername = normalizeUsername(entry.student_username ?? "");
    const guardianUsername = normalizeUsername(entry.guardian_username ?? "");
    const studentEmail = (entry.student_email ?? "").trim().toLowerCase();
    const guardianEmail = (entry.guardian_email ?? "").trim().toLowerCase();

    if (studentUsername || studentEmail)
      targets.push({
        role: "student",
        username: studentUsername || null,
        email: studentUsername ? usernameToEmail(studentUsername) : studentEmail,
        contactEmail: studentEmail,
      });

    if (guardianUsername || guardianEmail)
      targets.push({
        role: "parent",
        username: guardianUsername || null,
        email: guardianUsername ? usernameToEmail(guardianUsername) : guardianEmail,
        contactEmail: guardianEmail,
      });

    for (const target of targets) {
      const fail = (detail: string) =>
        results.push({
          student: name,
          role: target.role,
          username: target.username,
          email: target.email,
          password: null,
          status: "failed",
          detail,
        });

      if (target.username && !isValidUsername(target.username)) {
        fail("invalid username");
        continue;
      }
      // An email is only required when there is no username to sign in with —
      // username accounts register their own email at first sign-in.
      if (!target.username && !EMAIL_RE.test(target.contactEmail)) {
        fail("a username or email address is required");
        continue;
      }
      if (target.contactEmail && (!EMAIL_RE.test(target.contactEmail) || target.contactEmail.length > 255)) {
        fail("invalid email address");
        continue;
      }


      let userId = target.username
        ? await findUserIdByUsername(admin, target.username)
        : null;
      if (!userId && target.contactEmail)
        userId = await findUserIdByEmail(admin, target.contactEmail);

      let password: string | null = null;
      let status: ProvisionedAccount["status"] = "linked";

      if (!userId) {
        password = tempPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email: target.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: target.role === "student" ? name : `${entry.last_name} guardian`,
            role: target.role,
            ...(target.contactEmail ? { contact_email: target.contactEmail } : {}),
            ...(target.username ? { username: target.username } : {}),
          },
        });
        if (error || !data.user) {
          fail(error?.message ?? "could not create account");
          continue;
        }
        userId = data.user.id;
        status = "created";
        if (!target.contactEmail) {
          // No inbox yet — clear the synthetic address so the person is asked
          // to register a real email the first time they sign in.
          await admin.from("profiles").update({ email: null }).eq("id", userId);
        }
      } else if (target.contactEmail) {
        // Keep the contact address current so notifications reach them.
        await admin.from("profiles").update({ email: target.contactEmail }).eq("id", userId);
      }

      const update =
        target.role === "student"
          ? { user_id: userId }
          : {
              guardian_user_id: userId,
              ...(target.contactEmail ? { guardian_email: target.contactEmail } : {}),
            };

      const { error: linkError } = await admin
        .from("students")
        .update(update)
        .eq("id", entry.student_id);

      results.push({
        student: name,
        role: target.role,
        username: target.username,
        email: target.email,
        password,
        status: linkError ? "failed" : status,
        ...(linkError ? { detail: linkError.message } : {}),
      });
    }
  }

  return results;
}
