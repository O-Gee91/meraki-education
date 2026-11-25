import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Staff: draft a short feedback comment from score, rubric results and the teacher's notes. Nothing is saved. */
export const suggestFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentTitle: z.string().max(300),
        studentFirstName: z.string().max(80).optional(),
        gradeLevel: z.number().int().min(1).max(12).optional(),
        score: z.number().nullable().optional(),
        pointsPossible: z.number().nullable().optional(),
        rubric: z
          .array(
            z.object({
              criterion: z.string().max(200),
              level: z.string().max(120).optional(),
              descriptor: z.string().max(1000).optional(),
              earned: z.number().optional(),
              max: z.number().optional(),
            }),
          )
          .max(20)
          .optional(),
        teacherNotes: z.string().max(3000).optional(),
            assignmentId: z.uuid().optional(),
            submissionId: z.uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can draft feedback");
    const { data: flags, error: flagError } = await context.supabase.rpc("evaluated_feature_flags", {
      ...(data.assignmentId ? { _assignment_id: data.assignmentId } : {}),
      ...(data.submissionId ? { _submission_id: data.submissionId } : {}),
    });
    if (flagError || !flags?.some((flag) => flag.key === "ai_feedback_suggestions" && flag.enabled)) {
      return { suggestion: "", error: "AI comment suggestions are not enabled for this audience." };
    }
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { suggestion: "", error: "AI is not configured for this school" };

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const lines = [`Assignment: ${data.assignmentTitle}`];
    if (data.gradeLevel) lines.push(`Student grade level: ${data.gradeLevel}`);
    if (data.studentFirstName) lines.push(`Student first name: ${data.studentFirstName}`);
    if (data.score != null && data.pointsPossible)
      lines.push(`Score: ${data.score}/${data.pointsPossible} (${((data.score / data.pointsPossible) * 100).toFixed(0)}%)`);
    if (data.rubric?.length) {
      lines.push("Rubric results:");
      for (const r of data.rubric)
        lines.push(`- ${r.criterion}: ${r.level ?? "not scored"}${r.earned != null && r.max ? ` (${r.earned}/${r.max})` : ""}${r.descriptor ? ` — ${r.descriptor}` : ""}`);
    }
    if (data.teacherNotes?.trim()) lines.push(`Teacher's own notes (most important):\n${data.teacherNotes.trim()}`);

    const system = [
      "You help a middle school teacher (grades 5-9) write feedback to a student.",
      "Write 2-4 short sentences addressed to the student: one specific strength, one clear next step, in calm, warm, plain language.",
      "Base it only on the facts given; the teacher's notes take priority over rubric wording. Do not invent details about the work.",
      "No praise inflation, no badges/points/game language, no emojis, no headings. Return only the comment text.",
    ].join("\n");

    try {
      const result = streamText({
        model: openai.responses("openai/gpt-6.1-sol"),
        system,
        prompt: lines.join("\n"),
        maxRetries: 0,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } },
      });
      const text = (await result.text).trim();
      if (!text) return { suggestion: "", error: "No suggestion was returned. Write the comment yourself or try later." };
      return { suggestion: text, error: null as string | null };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("suggestFeedback failed", status, e);
      if (status === 429) return { suggestion: "", error: "Too many requests right now — try again in a minute." };
      if (status === 402) return { suggestion: "", error: "AI credits have run out for this workspace." };
      return { suggestion: "", error: "Couldn't draft a suggestion right now." };
    }
  });
