import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAll } from "@/lib/query";

const contextSchema = z.object({ assignmentId: z.uuid().optional(), submissionId: z.uuid().optional() });

export const evaluateFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contextSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: flags, error } = await context.supabase.rpc("evaluated_feature_flags", {
      ...(data.assignmentId ? { _assignment_id: data.assignmentId } : {}),
      ...(data.submissionId ? { _submission_id: data.submissionId } : {}),
    });
    if (error) throw new Error("Couldn't check feature availability");
    return flags ?? [];
  });

export const listFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Administrator access required");
    const [flags, users, classes] = await Promise.all([
      fetchAll((from, to) => context.supabase.from("feature_flags").select("*").order("key").range(from, to)),
      fetchAll((from, to) => context.supabase.from("profiles").select("id, full_name").order("id").range(from, to)),
      fetchAll((from, to) => context.supabase.from("classes").select("id, name").order("id").range(from, to)),
    ]);
    return { flags, users, classes };
  });

export const updateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    key: z.string().min(1).max(100),
    enabled: z.boolean(),
    scope: z.enum(["all", "staff_only", "pilot_only"]),
    target_user_ids: z.array(z.uuid()).max(1000),
    target_class_ids: z.array(z.uuid()).max(1000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !admin) throw new Error("Administrator access required");
    const { key, ...changes } = data;
    const { data: saved, error } = await context.supabase.from("feature_flags")
      .update(changes).eq("key", key).select("*").single();
    if (error) throw new Error("Couldn't save the feature switch");
    return saved;
  });