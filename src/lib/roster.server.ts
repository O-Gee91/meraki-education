import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ProvisionEntry = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_email?: string | null;
  guardian_email?: string | null;
};

export type ProvisionedAccount = {
  student: string;
  role: "student" | "parent";
  email: string;
  password: string | null;
  status: "created" | "linked" | "failed";
  detail?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `Mk-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

async function findExistingUserId(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

export async function provisionRosterAccounts(
  admin: SupabaseClient<Database>,
  entries: ProvisionEntry[],
): Promise<ProvisionedAccount[]> {
  const results: ProvisionedAccount[] = [];

  for (const entry of entries.slice(0, 200)) {
    const name = `${entry.first_name} ${entry.last_name}`.trim();
    const targets: Array<{ role: "student" | "parent"; email: string }> = [];
    const studentEmail = (entry.student_email ?? "").trim().toLowerCase();
    const guardianEmail = (entry.guardian_email ?? "").trim().toLowerCase();
    if (studentEmail) targets.push({ role: "student", email: studentEmail });
    if (guardianEmail) targets.push({ role: "parent", email: guardianEmail });

    for (const target of targets) {
      if (!EMAIL_RE.test(target.email) || target.email.length > 255) {
        results.push({
          student: name,
          role: target.role,
          email: target.email,
          password: null,
          status: "failed",
          detail: "invalid email",
        });
        continue;
      }

      const column = target.role === "student" ? "user_id" : "guardian_user_id";
      let userId = await findExistingUserId(admin, target.email);
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
          },
        });
        if (error || !data.user) {
          results.push({
            student: name,
            role: target.role,
            email: target.email,
            password: null,
            status: "failed",
            detail: error?.message ?? "could not create account",
          });
          continue;
        }
        userId = data.user.id;
        status = "created";
      }

      const update: Record<string, string> = { [column]: userId };
      if (target.role === "parent") update["guardian_email"] = target.email;
      const { error: linkError } = await admin
        .from("students")
        .update(update)
        .eq("id", entry.student_id);

      results.push({
        student: name,
        role: target.role,
        email: target.email,
        password,
        status: linkError ? "failed" : status,
        ...(linkError ? { detail: linkError.message } : {}),
      });
    }
  }

  return results;
}
