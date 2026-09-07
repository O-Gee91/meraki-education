import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { parseCriteria, rubricTotal } from "@/lib/rubrics";

const criterionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  levels: z
    .array(
      z.object({
        label: z.string(),
        points: z.number(),
        descriptor: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * Staff: read an uploaded rubric (photo, scan or pasted text) and turn it into an
 * editable rubric draft. Nothing is saved — the teacher reviews it first.
 */
export const digitizeRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().max(20000).optional(),
        fileName: z.string().max(300).optional(),
        mimeType: z.string().max(120).optional(),
        dataBase64: z.string().max(14_000_000).optional(),
      })
      .refine((v) => (v.text && v.text.trim().length > 20) || (v.dataBase64 && v.mimeType), {
        message: "Upload a rubric file or paste the rubric text",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can digitise a rubric");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this school");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText, Output, NoObjectGeneratedError } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const schema = z.object({
      title: z.string(),
      description: z.string().optional(),
      criteria: z.array(criterionSchema).min(1),
    });

    const instructions = [
      "You are helping a middle school teacher digitise a grading rubric.",
      "Read the rubric provided and return it as structured data.",
      'Return JSON with these keys: "title" (short rubric name), "description" (one sentence, optional) and "criteria".',
      'Each criterion needs "title" (the row/skill being judged), "description" (optional short explanation) and "levels".',
      'Each level needs "label" (e.g. Exceeds, Meets, Approaching, Beginning, or 4/3/2/1), "points" (the number of points that level is worth) and "descriptor" (the wording that describes that level).',
      "Keep the teacher's own wording. Keep the same number of levels for every criterion. If points are missing, use the highest level count down to 1.",
      "Use at most 20 criteria and 6 levels per criterion.",
    ].join("\n");

    const content: Array<Record<string, unknown>> = [{ type: "text", text: instructions }];
    if (data.text && data.text.trim().length > 20) {
      content.push({ type: "text", text: `Rubric text:\n${data.text.slice(0, 20000)}` });
    }
    if (data.dataBase64 && data.mimeType) {
      const isImage = data.mimeType.startsWith("image/");
      content.push(
        isImage
          ? { type: "image", image: data.dataBase64, mediaType: data.mimeType }
          : {
              type: "file",
              data: data.dataBase64,
              mediaType: data.mimeType,
              filename: data.fileName ?? "rubric",
            },
      );
    }

    let parsed: z.infer<typeof schema>;
    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        output: Output.object({ schema }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: content as any }],
      });
      parsed = output;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) && e.text) {
        try {
          parsed = schema.parse(JSON.parse(e.text));
        } catch {
          throw new Error(
            "The rubric could not be read. Try a clearer photo, or paste the rubric text instead.",
          );
        }
      } else {
        throw e;
      }
    }

    const criteria = parseCriteria(
      parsed.criteria.map((c, i) => ({
        id: `c${i + 1}`,
        title: c.title,
        description: c.description ?? "",
        levels: c.levels.map((l) => ({
          label: l.label,
          points: l.points,
          descriptor: l.descriptor ?? "",
        })),
      })),
    );
    if (criteria.length === 0) throw new Error("No rubric rows were found in that file");

    return {
      title: parsed.title.slice(0, 140) || "Imported rubric",
      description: (parsed.description ?? "").slice(0, 1000),
      criteria,
      totalPoints: rubricTotal(criteria),
    };
  });

/** Publish a rubric to the shared library for teachers of a grade. */
export const shareRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rubricId: z.string().uuid(),
        gradeLevel: z.number().int().min(1).max(12),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can share rubrics");

    const { data: rubric, error } = await context.supabase
      .from("rubrics")
      .select("id, class_id, title, description, subject, criteria, total_points, created_by")
      .eq("id", data.rubricId)
      .maybeSingle();
    if (error) throw error;
    if (!rubric) throw new Error("Rubric not found");

    if (rubric.created_by !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("is_admin");
      let allowed = !!isAdmin;
      if (!allowed && rubric.class_id) {
        const { data: canManage } = await context.supabase.rpc("can_manage_class", {
          _class_id: rubric.class_id,
        });
        allowed = !!canManage;
      }
      if (!allowed) throw new Error("You can only share your own rubrics");
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("shared_resources")
      .insert({
        kind: "rubric",
        grade_level: data.gradeLevel,
        subject: rubric.subject ?? null,
        title: rubric.title.slice(0, 140),
        description: (data.note?.trim() || rubric.description || "")?.slice(0, 1000) || null,
        payload: {
          description: rubric.description,
          criteria: rubric.criteria,
          total_points: Number(rubric.total_points),
        } as unknown as Json,
        source_class_id: rubric.class_id,
        shared_by: context.userId,
        shared_by_name: (profile?.full_name || "A teacher").slice(0, 120),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { id: inserted.id };
  });

/** Copy a shared rubric into one of my classes as my own editable rubric. */
export const copySharedRubric = createServerFn({ method: "POST" })
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
    if (!canManage) throw new Error("You can only copy rubrics into classes you teach");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: resource, error } = await supabaseAdmin
      .from("shared_resources")
      .select("id, kind, title, description, payload, grade_level, shared_by")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (error) throw error;
    if (!resource || resource.kind !== "rubric") {
      throw new Error("This shared rubric is no longer available");
    }

    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    let visible = !!isAdmin || resource.shared_by === context.userId;
    if (!visible && resource.grade_level != null) {
      const { data: teaches } = await context.supabase.rpc("teaches_grade", {
        _grade: resource.grade_level,
      });
      visible = !!teaches;
    }
    if (!visible) throw new Error("This shared rubric is not available to you");

    const payload = (resource.payload ?? {}) as Record<string, unknown>;
    const criteria = parseCriteria(payload["criteria"]);
    if (criteria.length === 0) throw new Error("That shared rubric has no rows to copy");

    const { data: klass } = await supabaseAdmin
      .from("classes")
      .select("grade_level, subject")
      .eq("id", data.classId)
      .maybeSingle();

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("rubrics")
      .insert({
        class_id: data.classId,
        title: (data.title?.trim() || resource.title).slice(0, 140),
        description:
          typeof payload["description"] === "string"
            ? (payload["description"] as string).slice(0, 1000)
            : resource.description,
        grade_level: klass?.grade_level ?? resource.grade_level ?? null,
        subject: klass?.subject ?? null,
        criteria: criteria as unknown as Json,
        total_points: rubricTotal(criteria),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { id: inserted.id };
  });
