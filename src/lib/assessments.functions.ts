import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AnswerKey, EssayIssue, PaperQuestion, QuestionKind } from "@/lib/assessments";

const ResponseSchema = z.object({
  choice: z.number().int().min(0).max(50).optional(),
  choices: z.array(z.number().int().min(0).max(50)).optional(),
  text: z.string().max(20000).optional(),
  value: z.number().optional(),
});

/** Students/parents fetch a paper without answer keys. */
export const getAssessmentPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assessmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: assessment, error } = await context.supabase
      .from("assessments")
      .select(
        "id, class_id, assignment_id, title, instructions, kind, time_limit_minutes, due_at, available_from, closes_at, published, grammar_check_enabled",
      )
      .eq("id", data.assessmentId)
      .maybeSingle();
    if (error) throw error;
    if (!assessment) throw new Error("Assessment not found");

    // Only staff may see grading guidance; it can reveal expected answers.
    const { data: isStaff } = await context.supabase.rpc("is_staff");

    const { data: klass } = await context.supabase
      .from("classes")
      .select("timezone")
      .eq("id", assessment.class_id)
      .maybeSingle();
    const timeZone = klass?.timezone ?? "Asia/Shanghai";

    // Before the start time the paper itself stays hidden from students.
    const notYet =
      assessment.available_from != null &&
      Date.now() < Date.parse(assessment.available_from);
    if (notYet && isStaff !== true) {
      return { assessment, questions: [] as PaperQuestion[], timeZone };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, position, kind, prompt, options, points, rubric")
      .eq("assessment_id", assessment.id)
      .order("position", { ascending: true });
    if (qErr) throw qErr;

    const questions: PaperQuestion[] = (rows ?? []).map((q) => ({
      id: q.id,
      position: q.position,
      kind: q.kind as QuestionKind,
      prompt: q.prompt,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      points: Number(q.points),
      rubric: isStaff === true ? q.rubric : null,
    }));


    return { assessment, questions, timeZone };
  });

/** Submit an attempt; objective questions are graded instantly. */
export const submitAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assessmentId: z.string().uuid(),
        answers: z
          .array(z.object({ questionId: z.string().uuid(), response: ResponseSchema }))
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: studentRows, error: sErr } = await context.supabase
      .from("students")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1);
    if (sErr) throw sErr;
    const student = studentRows?.[0];
    if (!student) throw new Error("Only enrolled students can submit an assessment");


    const { data: assessment, error: aErr } = await context.supabase
      .from("assessments")
      .select("id, class_id, assignment_id, published, available_from, closes_at")
      .eq("id", data.assessmentId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!assessment?.published) throw new Error("This assessment is not open");

    // Availability window. Before the start time nothing can be handed in; after
    // the end time the attempt is accepted but flagged late and left out of the
    // gradebook until the teacher chooses to count it.
    const now = Date.now();
    if (assessment.available_from && now < Date.parse(assessment.available_from))
      throw new Error("This assessment is not yet available");
    const isLate = Boolean(assessment.closes_at && now > Date.parse(assessment.closes_at));

    const { data: enrollment } = await context.supabase
      .from("enrollments")
      .select("id")
      .eq("class_id", assessment.class_id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (!enrollment) throw new Error("You are not enrolled in this class");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { autoGrade } = await import("@/lib/grading.server");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, kind, points, answer_key")
      .eq("assessment_id", assessment.id);
    if (qErr) throw qErr;

    const { data: existing } = await supabaseAdmin
      .from("assessment_submissions")
      .select("id, status")
      .eq("assessment_id", assessment.id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existing) throw new Error("You have already submitted this assessment");

    const totalPoints = (questions ?? []).reduce((sum, q) => sum + Number(q.points), 0);
    let autoScore = 0;
    let needsReview = false;

    const graded = (questions ?? []).map((q) => {
      const submitted = data.answers.find((a) => a.questionId === q.id);
      const result = autoGrade(
        q.kind as QuestionKind,
        (q.answer_key ?? {}) as AnswerKey,
        submitted?.response ?? {},
        Number(q.points),
      );
      if (result) autoScore += result.pointsAwarded;
      else needsReview = true;
      return {
        question_id: q.id,
        response: submitted?.response ?? {},
        is_correct: result?.isCorrect ?? null,
        points_awarded: result?.pointsAwarded ?? null,
      };
    });

    const { data: submission, error: subErr } = await supabaseAdmin
      .from("assessment_submissions")
      .insert({
        assessment_id: assessment.id,
        student_id: student.id,
        status: needsReview ? "needs_review" : "graded",
        auto_score: autoScore,
        manual_score: 0,
        total_points: totalPoints,
        graded_at: needsReview ? null : new Date().toISOString(),
        is_late: isLate,
        late_accepted: false,
      })
      .select("id")
      .single();
    if (subErr) throw subErr;

    if (graded.length > 0) {
      const { error: ansErr } = await supabaseAdmin
        .from("assessment_answers")
        .insert(graded.map((g) => ({ ...g, submission_id: submission.id })));
      if (ansErr) throw ansErr;
    }

    // Late work does not reach the gradebook until a teacher accepts it.
    if (assessment.assignment_id && !needsReview && !isLate) {
      await supabaseAdmin.from("grades").upsert(
        {
          assignment_id: assessment.assignment_id,
          student_id: student.id,
          points_earned: autoScore,
          comment: "Auto-graded assessment",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
    }

    return {
      submissionId: submission.id,
      autoScore,
      totalPoints,
      needsReview,
      isLate,
    };
  });

/** Staff: release manual/essay scores and sync to the gradebook. */
export const scoreEssayAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        answerId: z.string().uuid(),
        points: z.number().min(0).max(10000),
        feedback: z.string().max(5000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can grade responses");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("assessment_answers")
      .update({
        points_awarded: data.points,
        feedback: data.feedback ?? null,
        is_correct: null,
      })
      .eq("id", data.answerId);
    if (error) throw error;

    const { data: answer } = await supabaseAdmin
      .from("assessment_answers")
      .select("submission_id")
      .eq("id", data.answerId)
      .maybeSingle();
    if (!answer) return { ok: true };

    const { data: answers } = await supabaseAdmin
      .from("assessment_answers")
      .select("points_awarded, question_id, assessment_questions(kind, answer_key)")
      .eq("submission_id", answer.submission_id);

    // Essays and "answers will vary" short answers are the teacher-scored ones.
    const isManualQuestion = (row: unknown) => {
      const q = (row as { assessment_questions: { kind: string; answer_key: unknown } | null })
        .assessment_questions;
      if (!q) return false;
      if (q.kind === "essay") return true;
      if (q.kind !== "short_answer") return false;
      const key = (q.answer_key ?? {}) as { manual?: boolean; accepted?: string[] };
      return Boolean(key.manual) || (key.accepted ?? []).length === 0;
    };

    const manual = (answers ?? [])
      .filter(isManualQuestion)
      .reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
    const pendingEssay = (answers ?? []).some(
      (a) => isManualQuestion(a) && a.points_awarded == null,
    );

    const { data: submission } = await supabaseAdmin
      .from("assessment_submissions")
      .update({
        manual_score: manual,
        status: pendingEssay ? "needs_review" : "graded",
        graded_at: pendingEssay ? null : new Date().toISOString(),
      })
      .eq("id", answer.submission_id)
      .select("id, student_id, auto_score, assessment_id, is_late, late_accepted")
      .single();

    // A late attempt only counts once the teacher has accepted it.
    const countsTowardGrade =
      submission != null && (!submission.is_late || submission.late_accepted);

    if (submission && !pendingEssay && countsTowardGrade) {
      const { data: assessment } = await supabaseAdmin
        .from("assessments")
        .select("assignment_id")
        .eq("id", submission.assessment_id)
        .maybeSingle();
      if (assessment?.assignment_id) {
        await supabaseAdmin.from("grades").upsert(
          {
            assignment_id: assessment.assignment_id,
            student_id: submission.student_id,
            points_earned: Number(submission.auto_score) + manual,
            comment: "Assessment graded",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
      }
    }

    return { ok: true };
  });

/**
 * Staff: decide whether a late attempt counts. Accepting pushes the score into
 * the gradebook; withdrawing acceptance removes it again.
 */
export const setLateAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ submissionId: z.string().uuid(), accepted: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can accept late work");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: submission, error } = await supabaseAdmin
      .from("assessment_submissions")
      .update({ late_accepted: data.accepted })
      .eq("id", data.submissionId)
      .select("id, student_id, auto_score, manual_score, status, assessment_id")
      .single();
    if (error) throw error;

    const { data: assessment } = await supabaseAdmin
      .from("assessments")
      .select("assignment_id")
      .eq("id", submission.assessment_id)
      .maybeSingle();
    if (!assessment?.assignment_id) return { ok: true, accepted: data.accepted };

    if (data.accepted) {
      if (submission.status === "graded") {
        await supabaseAdmin.from("grades").upsert(
          {
            assignment_id: assessment.assignment_id,
            student_id: submission.student_id,
            points_earned: Number(submission.auto_score) + Number(submission.manual_score),
            comment: "Late assessment accepted",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
      }
    } else {
      await supabaseAdmin
        .from("grades")
        .delete()
        .eq("assignment_id", assessment.assignment_id)
        .eq("student_id", submission.student_id);
    }

    return { ok: true, accepted: data.accepted };
  });

/** Staff: AI grammar + writing proof of an essay response. */
export const proofreadEssay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ answerId: z.string().uuid(), gradeLevel: z.number().int().min(1).max(12).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("Only teachers and admins can run grammar proofing");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this school");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: answer, error } = await supabaseAdmin
      .from("assessment_answers")
      .select("id, response, question_id, assessment_questions(prompt, rubric, points)")
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw error;
    if (!answer) throw new Error("Response not found");

    const question = answer.assessment_questions as
      | { prompt: string; rubric: string | null; points: number }
      | null;
    const essay = ((answer.response ?? {}) as { text?: string }).text ?? "";
    if (essay.trim().length < 20) throw new Error("This response is too short to proof");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText, Output, NoObjectGeneratedError } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const schema = z.object({
      summary: z.string(),
      suggestedPoints: z.number(),
      issues: z.array(
        z.object({
          type: z.string().optional(),
          excerpt: z.string().optional(),
          original: z.string().optional(),
          suggestion: z.string().optional(),
          explanation: z.string().optional(),
        }),
      ),
    });

    const prompt = [
      `You are an experienced ${data.gradeLevel ? `grade ${data.gradeLevel} ` : ""}English teacher proofreading a student essay.`,
      `Prompt: ${question?.prompt ?? "(not provided)"}`,
      question?.rubric ? `Rubric: ${question.rubric}` : "",
      `Points possible: ${question?.points ?? 10}`,
      "",
      "Student essay:",
      essay.slice(0, 12000),
      "",
      'Return JSON with exactly these keys: "summary" (max 3 sentences on grammar, mechanics, structure and evidence), "suggestedPoints" (number between 0 and the points possible), and "issues" (up to 12 items). Every issue object must use exactly these key names: "type" (grammar, spelling, punctuation, run-on, fragment, word choice, clarity, structure or evidence), "excerpt" (the exact wording copied from the essay), "suggestion" (the corrected wording), "explanation" (one student-friendly sentence). Do not use the key "original".',
    ]
      .filter(Boolean)
      .join("\n");

    let parsed: z.infer<typeof schema>;
    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        output: Output.object({ schema }),
        prompt,
      });
      parsed = output;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) && e.text) {
        try {
          parsed = schema.parse(JSON.parse(e.text));
        } catch {
          throw new Error("The grammar proof could not be read. Please try again.");
        }
      } else {
        throw e;
      }
    }

    const maxPoints = Number(question?.points ?? 10);
    const suggested = Math.max(0, Math.min(maxPoints, Number(parsed.suggestedPoints ?? 0)));
    const issues: EssayIssue[] = parsed.issues.slice(0, 12).map((i) => ({
      type: i.type ?? "writing",
      excerpt: i.excerpt ?? i.original ?? "",
      suggestion: i.suggestion ?? "",
      explanation: i.explanation ?? "",
    }));

    const { data: review, error: rErr } = await supabaseAdmin
      .from("essay_reviews")
      .insert({
        answer_id: answer.id,
        summary: parsed.summary.slice(0, 2000),
        issues,
        suggested_points: suggested,
        created_by: context.userId,
      })
      .select("id, summary, issues, suggested_points, created_at")
      .single();
    if (rErr) throw rErr;

    return review;
  });
