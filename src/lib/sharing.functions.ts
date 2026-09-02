import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type {
  SharedAssessmentPayload,
  SharedAssignmentPayload,
} from "@/lib/sharing";

/** Publish an assignment or assessment to the shared teacher library. */
export const shareResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["assignment", "assessment"]),
        id: z.string().uuid(),
        gradeLevel: z.number().int().min(1).max(12),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can share resources");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    let classId: string;
    let title: string;
    let description: string | null;
    let payload: SharedAssignmentPayload | SharedAssessmentPayload;

    if (data.kind === "assignment") {
      const { data: row, error } = await context.supabase
        .from("assignments")
        .select(
          "id, class_id, title, category, points_possible, due_date, description, submission_mode",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Assignment not found");
      classId = row.class_id;
      title = row.title;
      description = row.description;
      payload = {
        category: row.category,
        points_possible: Number(row.points_possible),
        due_date: row.due_date,
        description: row.description,
        submission_mode: row.submission_mode,
      };
    } else {
      const { data: row, error } = await context.supabase
        .from("assessments")
        .select(
          "id, class_id, title, instructions, kind, time_limit_minutes, grammar_check_enabled",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Assessment not found");
      classId = row.class_id;
      title = row.title;
      description = row.instructions;

      const { data: questions, error: qErr } = await supabaseAdmin
        .from("assessment_questions")
        .select("position, kind, prompt, options, answer_key, points, rubric")
        .eq("assessment_id", row.id)
        .order("position", { ascending: true });
      if (qErr) throw qErr;

      payload = {
        kind: row.kind,
        instructions: row.instructions,
        time_limit_minutes: row.time_limit_minutes,
        grammar_check_enabled: row.grammar_check_enabled,
        questions: (questions ?? []).map((q) => ({
          position: q.position,
          kind: q.kind,
          prompt: q.prompt,
          options: Array.isArray(q.options) ? (q.options as string[]) : [],
          answer_key: (q.answer_key ?? {}) as Record<string, unknown>,
          points: Number(q.points),
          rubric: q.rubric,
        })),
      };
    }

    const { data: canManage } = await context.supabase.rpc("can_manage_class", {
      _class_id: classId,
    });
    if (!canManage) throw new Error("You can only share resources from your own classes");

    const { data: klass } = await context.supabase
      .from("classes")
      .select("grade_level, subject")
      .eq("id", classId)
      .maybeSingle();

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("shared_resources")
      .insert({
        kind: data.kind,
        grade_level: data.gradeLevel,
        subject: klass?.subject ?? null,
        title: title.slice(0, 140),
        description: (data.note?.trim() || description || "")?.slice(0, 1000) || null,
        payload: payload as unknown as Json,
        source_class_id: classId,
        shared_by: context.userId,
        shared_by_name: (profile?.full_name || "A teacher").slice(0, 120),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return { id: inserted.id };
  });

/** Copy a shared resource into one of my classes as an independent draft. */
export const copySharedResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        resourceId: z.string().uuid(),
        classId: z.string().uuid(),
        title: z.string().min(2).max(140).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("can_manage_class", {
      _class_id: data.classId,
    });
    if (!canManage) throw new Error("You can only copy into a class you teach");

    // Read through the caller's client so grade-level visibility rules apply.
    const { data: resource, error } = await context.supabase
      .from("shared_resources")
      .select("id, kind, title, description, payload")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (error) throw error;
    if (!resource) throw new Error("This shared resource is not available to you");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const title = (data.title ?? resource.title).slice(0, 140);

    if (resource.kind === "assignment") {
      const p = resource.payload as SharedAssignmentPayload;
      const { data: created, error: aErr } = await supabaseAdmin
        .from("assignments")
        .insert({
          class_id: data.classId,
          title,
          category: p.category || "Homework",
          points_possible: Number(p.points_possible) || 100,
          due_date: null,
          description: p.description ?? resource.description,
          submission_mode: p.submission_mode || "collected",
        })
        .select("id")
        .single();
      if (aErr) throw aErr;
      return { kind: "assignment" as const, id: created.id };
    }

    const p = resource.payload as SharedAssessmentPayload;
    const { data: created, error: cErr } = await supabaseAdmin
      .from("assessments")
      .insert({
        class_id: data.classId,
        title,
        instructions: p.instructions ?? resource.description,
        kind: p.kind || "quiz",
        time_limit_minutes: p.time_limit_minutes ?? null,
        grammar_check_enabled: !!p.grammar_check_enabled,
        published: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;

    const questions = Array.isArray(p.questions) ? p.questions : [];
    if (questions.length > 0) {
      const { error: qErr } = await supabaseAdmin.from("assessment_questions").insert(
        questions.map((q, i) => ({
          assessment_id: created.id,
          position: q.position ?? i + 1,
          kind: q.kind,
          prompt: q.prompt,
          options: (q.options ?? []) as unknown as Json,
          answer_key: (q.answer_key ?? {}) as unknown as Json,
          points: Number(q.points) || 1,
          rubric: q.rubric ?? null,
        })),
      );
      if (qErr) throw qErr;
    }

    return { kind: "assessment" as const, id: created.id };
  });

/** Copy an existing assignment or assessment into other classes I manage. */
export const copyResourceToClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["assignment", "assessment"]),
        id: z.string().uuid(),
        classIds: z.array(z.string().uuid()).min(1).max(30),
        keepDueDate: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify every target class is mine (or I'm an admin).
    for (const classId of data.classIds) {
      const { data: canManage } = await context.supabase.rpc("can_manage_class", {
        _class_id: classId,
      });
      if (!canManage) throw new Error("You can only copy into classes you teach");
    }

    if (data.kind === "assignment") {
      const { data: row, error } = await context.supabase
        .from("assignments")
        .select("id, class_id, title, category, points_possible, due_date, description, submission_mode")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Assignment not found");

      const { data: sourceOk } = await context.supabase.rpc("can_manage_class", {
        _class_id: row.class_id,
      });
      if (!sourceOk) throw new Error("You can only copy assignments from your own classes");

      const targets = data.classIds.filter((c) => c !== row.class_id);
      if (targets.length === 0) return { copied: 0 };

      const { error: insErr } = await supabaseAdmin.from("assignments").insert(
        targets.map((classId) => ({
          class_id: classId,
          title: row.title,
          category: row.category,
          points_possible: Number(row.points_possible),
          due_date: data.keepDueDate ? row.due_date : null,
          description: row.description,
          submission_mode: row.submission_mode,
        })),
      );
      if (insErr) throw insErr;
      return { copied: targets.length };
    }

    const { data: row, error } = await context.supabase
      .from("assessments")
      .select("id, class_id, title, instructions, kind, time_limit_minutes, grammar_check_enabled, due_at, available_from")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Assessment not found");

    const { data: sourceOk } = await context.supabase.rpc("can_manage_class", {
      _class_id: row.class_id,
    });
    if (!sourceOk) throw new Error("You can only copy assessments from your own classes");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("position, kind, prompt, options, answer_key, points, rubric")
      .eq("assessment_id", row.id)
      .order("position", { ascending: true });
    if (qErr) throw qErr;

    const targets = data.classIds.filter((c) => c !== row.class_id);
    let copied = 0;

    for (const classId of targets) {
      const { data: created, error: cErr } = await supabaseAdmin
        .from("assessments")
        .insert({
          class_id: classId,
          title: row.title,
          instructions: row.instructions,
          kind: row.kind,
          time_limit_minutes: row.time_limit_minutes,
          grammar_check_enabled: row.grammar_check_enabled,
          due_at: data.keepDueDate ? row.due_at : null,
          available_from: data.keepDueDate ? row.available_from : null,
          published: false,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;

      if ((questions ?? []).length > 0) {
        const { error: qiErr } = await supabaseAdmin.from("assessment_questions").insert(
          (questions ?? []).map((q, i) => ({
            assessment_id: created.id,
            position: q.position ?? i + 1,
            kind: q.kind,
            prompt: q.prompt,
            options: q.options as unknown as Json,
            answer_key: q.answer_key as unknown as Json,
            points: Number(q.points) || 1,
            rubric: q.rubric ?? null,
          })),
        );
        if (qiErr) throw qiErr;
      }
      copied += 1;
    }

    return { copied };
  });

/** Remove a shared assignment/assessment from the library (owner or admin only). */
export const unshareResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ resourceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: resource, error } = await supabaseAdmin
      .from("shared_resources")
      .select("id, shared_by")
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
      throw new Error("The shared item could not be removed — please try again");
    }
    return { removed: deleted.length };
  });
