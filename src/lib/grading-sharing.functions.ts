import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { parseGradingSetup, totalWeight } from "@/lib/grading";

/** Publish a class's grading setup (scale, marks, categories) to the shared library. */
export const shareGradingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        title: z.string().min(2).max(140),
        note: z.string().max(1000).optional(),
        gradeLevel: z.number().int().min(1).max(12).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("can_manage_class", {
      _class_id: data.classId,
    });
    if (!canManage) throw new Error("You can only share grading setups from your own classes");

    const { data: klass, error } = await context.supabase
      .from("classes")
      .select("weights, grade_level, subject")
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw error;
    if (!klass) throw new Error("Class not found");

    const setup = parseGradingSetup(klass.weights);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("shared_resources")
      .insert({
        kind: "grading",
        grade_level:
          data.gradeLevel === undefined ? (klass.grade_level ?? null) : data.gradeLevel,
        subject: klass.subject ?? null,
        title: data.title.slice(0, 140),
        description: data.note?.trim()?.slice(0, 1000) || null,
        payload: setup as unknown as Json,
        source_class_id: data.classId,
        shared_by: context.userId,
        shared_by_name: (profile?.full_name || "A teacher").slice(0, 120),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { id: inserted.id };
  });

/** Apply a shared grading setup to one or more classes I manage. */
export const applySharedGradingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        resourceId: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: resource, error } = await supabaseAdmin
      .from("shared_resources")
      .select("id, kind, payload, grade_level, shared_by")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (error) throw error;
    if (!resource || resource.kind !== "grading") {
      throw new Error("This shared grading setup is no longer available");
    }

    // Visibility: admins, the owner, or teachers of that grade.
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    let visible = !!isAdmin || resource.shared_by === context.userId;
    if (!visible && resource.grade_level != null) {
      const { data: teaches } = await context.supabase.rpc("teaches_grade", {
        _grade: resource.grade_level,
      });
      visible = !!teaches;
    }
    if (!visible) throw new Error("This shared grading setup is not available to you");

    const setup = parseGradingSetup(resource.payload);
    if (setup.mode === "weighted" && Math.round(totalWeight(setup.categories)) !== 100) {
      throw new Error("The shared setup has category weights that do not total 100%");
    }

    for (const classId of data.classIds) {
      const { data: canManage, error: rpcErr } = await context.supabase.rpc(
        "can_manage_class",
        { _class_id: classId },
      );
      if (rpcErr) throw rpcErr;
      if (!canManage) throw new Error("You can only apply setups to classes you teach");
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("classes")
      .update({ weights: setup as unknown as Json })
      .in("id", data.classIds)
      .select("id");
    if (upErr) throw upErr;
    if (!updated || updated.length === 0) {
      throw new Error("The grading setup could not be applied — please try again");
    }

    return { applied: updated.length };
  });

/** Remove a shared grading setup from the library (owner or admin only). */
export const unshareGradingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ resourceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: resource, error } = await supabaseAdmin
      .from("shared_resources")
      .select("id, kind, shared_by")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (error) throw error;
    if (!resource) return { removed: 0 };

    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin && resource.shared_by !== context.userId) {
      throw new Error("Only the teacher who shared this (or an admin) can remove it");
    }

    const { data: deleted, error: delErr } = await supabaseAdmin
      .from("shared_resources")
      .delete()
      .eq("id", data.resourceId)
      .select("id");
    if (delErr) throw delErr;
    if (!deleted || deleted.length === 0) {
      throw new Error("The shared setup could not be removed — please try again");
    }
    return { removed: deleted.length };
  });

