import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const questionSchema = z.object({
  kind: z.enum(["multiple_choice", "multi_select", "true_false", "short_answer", "numeric", "essay"]),
  prompt: z.string(),
  options: z.array(z.string()),
  correct_choices: z.array(z.number().int()),
  accepted_answers: z.array(z.string()),
  numeric_value: z.number().nullable(),
  points: z.number(),
});

export type ImportedQuestion = z.infer<typeof questionSchema>;

/** Staff: read a test document or pasted text and return draft questions. Nothing is saved. */
export const extractQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().max(60000).optional(),
        fileName: z.string().max(300).optional(),
        mimeType: z.string().max(120).optional(),
        dataBase64: z.string().max(14_000_000).optional(),
      })
      .refine((v) => (v.text && v.text.trim().length > 10) || (v.dataBase64 && v.mimeType), {
        message: "Upload a file or paste the questions",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can import questions");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this school");

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const schema = z.object({ questions: z.array(questionSchema) });

    const instructions = [
      "You extract assessment questions from a middle school teacher's document.",
      "Return every question in order, keeping the teacher's wording exactly. Remove numbering like '1.' and choice letters like 'A)'.",
      'kind: "multiple_choice" (one correct), "multi_select" (several correct / select all), "true_false", "short_answer", "numeric" (single number answer), or "essay" (open response).',
      'options: answer choices for multiple_choice/multi_select; ["True","False"] for true_false; [] otherwise.',
      "correct_choices: 0-based indexes of correct options if an answer is marked or given in an answer key (including one at the end of the document); [] if unknown. For true_false 0=True, 1=False.",
      "accepted_answers: accepted answers for short_answer if known, else []. numeric_value: the number for numeric, else null.",
      "points: points stated in the document, otherwise 1.",
      "At most 100 questions. Ignore instructions, headers and names that are not questions.",
    ].join("\n");

    const content: Array<Record<string, unknown>> = [];
    if (data.text && data.text.trim().length > 10) {
      content.push({ type: "text", text: `Document text:\n${data.text.slice(0, 60000)}` });
    }
    if (data.dataBase64 && data.mimeType) {
      content.push({
        type: "file",
        data: data.dataBase64,
        mediaType: data.mimeType,
        filename: data.fileName ?? "document.pdf",
      });
    }

    let parsed: z.infer<typeof schema>;
    try {
      const result = streamText({
        model: openai.responses("openai/gpt-6-astra"),
        system: instructions,
        output: Output.object({ schema }),
        maxRetries: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: content as any }],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      parsed = await result.output;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 402) throw new Error("AI credits are used up for this workspace.");
      if (status === 429) throw new Error("Too many requests right now. Try again in a minute.");
      throw new Error("The questions could not be read. Try pasting the text instead.");
    }

    const questions = parsed.questions
      .slice(0, 100)
      .map((q) => {
        const options = q.kind === "true_false" ? ["True", "False"] : q.options.map((o) => o.trim()).filter(Boolean);
        return {
          ...q,
          prompt: q.prompt.trim().slice(0, 2000),
          options,
          correct_choices: q.correct_choices.filter((i) => i >= 0 && i < options.length),
          points: q.points > 0 && q.points <= 100 ? q.points : 1,
        };
      })
      .filter((q) => q.prompt.length >= 3);
    if (questions.length === 0) throw new Error("No questions were found in that document");
    return { questions };
  });
