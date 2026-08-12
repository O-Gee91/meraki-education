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
  email: string;
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

    if (studentUsername)
      targets.push({
        role: "student",
        username: studentUsername,
        email: usernameToEmail(studentUsername),
      });
    else if (studentEmail)
      targets.push({ role: "student", username: null, email: studentEmail });

    if (guardianUsername)
      targets.push({
        role: "parent",
        username: guardianUsername,
        email: usernameToEmail(guardianUsername),
      });
    else if (guardianEmail)
      targets.push({ role: "parent", username: null, email: guardianEmail });

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
      if (!target.username && (!EMAIL_RE.test(target.email) || target.email.length > 255)) {
        fail("invalid email");
        continue;
      }

      let userId = target.username
        ? await findUserIdByUsername(admin, target.username)
        : await findUserIdByEmail(admin, target.email);
      if (!userId) userId = await findUserIdByEmail(admin, target.email);

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
            ...(target.username ? { username: target.username } : {}),
          },
        });
        if (error || !data.user) {
          fail(error?.message ?? "could not create account");
          continue;
        }
        userId = data.user.id;
        status = "created";
      }

      const update =
        target.role === "student"
          ? { user_id: userId }
          : {
              guardian_user_id: userId,
              ...(target.username ? {} : { guardian_email: target.email }),
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
