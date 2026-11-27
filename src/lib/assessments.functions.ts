import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AnswerKey, EssayIssue, PaperQuestion, QuestionKind } from "@/lib/assessments";
import { ApiError, apiErrorFromDb, parseApiInput } from "@/lib/api-error";
import { classTimeZone, isLateAt } from "@/lib/coursework-window";
import { classCalendarDate } from "@/lib/late-penalty";
import { isSystemGradeComment } from "@/lib/grading";
import { boundedScoreError, overTotalScoreMessage, scoreExceedsTotal } from "@/lib/score-limit";

async function preservedGradeComment(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  assignmentId: string,
  studentId: string,
  fallback: string,
) {
  const { data } = await supabaseAdmin
    .from("grades")
    .select("comment")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  const current = data?.comment?.trim();
  return current && !isSystemGradeComment(current) ? current : fallback;
}

type GradeColumn = { points_possible: number | null; category: string | null };

/** Refuse a gradebook write that would store more points than the column allows. */
async function assertGradeWithinColumn(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  assignmentId: string,
  points: number,
) {
  const { data, error } = await admin
    .from("assignments")
    .select("points_possible, category")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const column = data as GradeColumn;
  if (scoreExceedsTotal(points, Number(column.points_possible), column.category)) {
    throw new Error(overTotalScoreMessage(Number(column.points_possible)));
  }
}

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
        "id, class_id, assignment_id, title, instructions, kind, time_limit_minutes, due_at, available_from, closes_at, published, grammar_check_enabled, shuffle_choices",
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
      .select("id, position, kind, prompt, options, points, rubric, lock_order")
      .eq("assessment_id", assessment.id)
      .order("position", { ascending: true });
    if (qErr) throw qErr;

    const { seededOrder } = await import("@/lib/assessments");
    const shuffle = assessment.shuffle_choices === true && isStaff !== true;
    const questions: PaperQuestion[] = (rows ?? []).map((q) => {
      const options = Array.isArray(q.options) ? (q.options as string[]) : [];
      const canShuffle =
        shuffle && !q.lock_order && (q.kind === "multiple_choice" || q.kind === "multi_select");
      const order = canShuffle
        ? seededOrder(options.length, `${assessment.id}:${context.userId}:${q.id}`)
        : null;
      return {
        id: q.id,
        position: q.position,
        kind: q.kind as QuestionKind,
        prompt: q.prompt,
        options: order ? order.map((i) => options[i]!) : options,
        ...(order ? { optionIndices: order } : {}),
        points: Number(q.points),
        rubric: isStaff === true ? q.rubric : null,
      };
    });


    return { assessment, questions, timeZone };
  });

const submitAssessmentInput = z.object({
  assessmentId: z.string().uuid(),
  answers: z.array(z.object({ questionId: z.string().uuid(), response: ResponseSchema })).max(200),
});

const ALREADY_SUBMITTED = "You have already submitted this assessment";

/** Submit an attempt; objective questions are graded instantly. */
export const submitAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseApiInput(submitAssessmentInput, input))
  .handler(async ({ data: input, context }) => {
    const data = parseApiInput(submitAssessmentInput, input);
    const { data: studentRows, error: sErr } = await context.supabase
      .from("students")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1);
    if (sErr) throw apiErrorFromDb(sErr);
    const student = studentRows?.[0];
    if (!student) throw new ApiError("forbidden", "Only enrolled students can submit an assessment");


    const { data: assessment, error: aErr } = await context.supabase
      .from("assessments")
      .select("id, class_id, assignment_id, published, available_from, closes_at, due_at")
      .eq("id", data.assessmentId)
      .maybeSingle();
    if (aErr) throw apiErrorFromDb(aErr);
    if (!assessment) throw new ApiError("not_found", "This assessment is not open");
    if (!assessment.published) throw new ApiError("forbidden", "This assessment is not open");

    // Availability window. Before the start time nothing can be handed in; after
    // the end time the attempt is accepted but flagged late and left out of the
    // gradebook until the teacher chooses to count it.
    const now = Date.now();
    if (assessment.available_from && now < Date.parse(assessment.available_from))
      throw new ApiError("forbidden", "This assessment is not yet available");
    const { data: schoolClass } = await context.supabase
      .from("classes")
      .select("timezone")
      .eq("id", assessment.class_id)
      .maybeSingle();
    const zone = classTimeZone(schoolClass?.timezone);
    const dueDay = assessment.due_at ? classCalendarDate(new Date(assessment.due_at), zone) : null;
    const isLate = isLateAt(now, assessment.closes_at, dueDay, zone);

    const { data: enrollment, error: enrollmentErr } = await context.supabase
      .from("enrollments")
      .select("id")
      .eq("class_id", assessment.class_id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (enrollmentErr) throw apiErrorFromDb(enrollmentErr);
    if (!enrollment) throw new ApiError("forbidden", "You are not enrolled in this class");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { autoGrade } = await import("@/lib/grading.server");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("assessment_questions")
      .select("id, kind, points, answer_key")
      .eq("assessment_id", assessment.id);
    if (qErr) throw apiErrorFromDb(qErr);

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("assessment_submissions")
      .select("id, status")
      .eq("assessment_id", assessment.id)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existingErr) throw apiErrorFromDb(existingErr);
    if (existing) throw new ApiError("conflict", ALREADY_SUBMITTED);

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
    if ((questions ?? []).length === 0) needsReview = true;

    // Late work does not reach the gradebook until a teacher accepts it.
    // Check the column before anything is saved so a too-small total cannot
    // leave a submission behind with no grade.
    if (assessment.assignment_id && !needsReview && !isLate) {
      try {
        await assertGradeWithinColumn(supabaseAdmin, assessment.assignment_id, autoScore);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof Error) throw new ApiError("validation", error.message);
        throw apiErrorFromDb(error as { message?: string; code?: string });
      }
    }

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
    if (subErr) {
      if (subErr.code === "23505") throw new ApiError("conflict", ALREADY_SUBMITTED);
      throw apiErrorFromDb(subErr);
    }

    if (graded.length > 0) {
      const { error: ansErr } = await supabaseAdmin
        .from("assessment_answers")
        .insert(graded.map((g) => ({ ...g, submission_id: submission.id })));
      if (ansErr) {
        await supabaseAdmin.from("assessment_submissions").delete().eq("id", submission.id);
        throw apiErrorFromDb(ansErr);
      }
    }

    if (assessment.assignment_id && !needsReview && !isLate) {
      const comment = await preservedGradeComment(
        supabaseAdmin,
        assessment.assignment_id,
        student.id,
        "Auto-graded assessment",
      );
      const { error: gradeErr } = await supabaseAdmin.from("grades").upsert(
        {
          assignment_id: assessment.assignment_id,
          student_id: student.id,
          points_earned: autoScore,
          comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (gradeErr) {
        await supabaseAdmin.from("assessment_submissions").delete().eq("id", submission.id);
        throw apiErrorFromDb(gradeErr);
      }
    }

    return {
      submissionId: submission.id,
      autoScore,
      totalPoints,
      needsReview,
      isLate,
    };
  });

type ScopedClient = { rpc: (fn: "can_manage_class", args: { _class_id: string }) => PromiseLike<{ data: unknown; error: unknown }> };
type AdminClient = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

/** Throws unless the caller manages the class that owns this assessment. */
async function assertManagesAssessment(scoped: ScopedClient, admin: AdminClient, assessmentId: string) {
  const { data: a } = await admin.from("assessments").select("class_id").eq("id", assessmentId).maybeSingle();
  if (!a?.class_id) throw new Error("Assessment not found");
  const { data: ok, error } = await scoped.rpc("can_manage_class", { _class_id: a.class_id });
  if (error || ok !== true) throw new Error("You can only manage assessments for your own classes");
}

/** Throws unless the caller manages the class that owns this answer. */
async function assertManagesAnswer(scoped: ScopedClient, admin: AdminClient, answerId: string) {
  const { data: ans } = await admin
    .from("assessment_answers").select("submission_id").eq("id", answerId).maybeSingle();
  if (!ans) throw new Error("Response not found");
  const { data: sub } = await admin
    .from("assessment_submissions").select("assessment_id").eq("id", ans.submission_id).maybeSingle();
  if (!sub) throw new Error("Response not found");
  await assertManagesAssessment(scoped, admin, sub.assessment_id);
}

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
    await assertManagesAnswer(context.supabase as unknown as ScopedClient, supabaseAdmin, data.answerId);

    const { data: current, error: currentErr } = await supabaseAdmin
      .from("assessment_answers")
      .select("submission_id, assessment_questions(points)")
      .eq("id", data.answerId)
      .maybeSingle();
    if (currentErr) throw currentErr;
    if (!current) throw new Error("Response not found");
    const questionPoints = Number(
      (current.assessment_questions as { points: number } | null)?.points,
    );
    const questionError = boundedScoreError(data.points, questionPoints, "question");
    if (questionError) throw new Error(questionError);

    const { data: siblings, error: siblingErr } = await supabaseAdmin
      .from("assessment_answers")
      .select("id, points_awarded, assessment_questions(kind, answer_key)")
      .eq("submission_id", current.submission_id);
    if (siblingErr) throw siblingErr;
    const isManualQuestion = (row: { assessment_questions: { kind: string; answer_key: unknown } | null }) => {
      const q = row.assessment_questions;
      if (!q) return false;
      if (q.kind === "essay") return true;
      if (q.kind !== "short_answer") return false;
      const key = (q.answer_key ?? {}) as { manual?: boolean; accepted?: string[] };
      return Boolean(key.manual) || (key.accepted ?? []).length === 0;
    };
    const manualPreview = (siblings ?? [])
      .filter((row) => isManualQuestion(row as { assessment_questions: { kind: string; answer_key: unknown } | null }))
      .reduce((sum, row) => sum + Number(row.id === data.answerId ? data.points : row.points_awarded ?? 0), 0);
    const { data: openSubmission, error: openErr } = await supabaseAdmin
      .from("assessment_submissions")
      .select("auto_score, total_points, assessment_id")
      .eq("id", current.submission_id)
      .maybeSingle();
    if (openErr) throw openErr;
    if (openSubmission) {
      const earned = Number(openSubmission.auto_score) + manualPreview;
      if (scoreExceedsTotal(earned, Number(openSubmission.total_points))) {
        throw new Error(overTotalScoreMessage(Number(openSubmission.total_points), "assessment"));
      }
      const { data: linked, error: linkedErr } = await supabaseAdmin
        .from("assessments")
        .select("assignment_id")
        .eq("id", openSubmission.assessment_id)
        .maybeSingle();
      if (linkedErr) throw linkedErr;
      if (linked?.assignment_id) await assertGradeWithinColumn(supabaseAdmin, linked.assignment_id, earned);
    }

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

    const asManualRow = (row: unknown) =>
      row as { assessment_questions: { kind: string; answer_key: unknown } | null; points_awarded: number | null };

    const manual = (answers ?? [])
      .filter((row) => isManualQuestion(asManualRow(row)))
      .reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
    const pendingEssay = (answers ?? []).some(
      (a) => isManualQuestion(asManualRow(a)) && a.points_awarded == null,
    );

    const { data: submission, error: submissionErr } = await supabaseAdmin
      .from("assessment_submissions")
      .update({
        manual_score: manual,
        status: pendingEssay ? "needs_review" : "graded",
        graded_at: pendingEssay ? null : new Date().toISOString(),
      })
      .eq("id", answer.submission_id)
      .select("id, student_id, auto_score, assessment_id, is_late, late_accepted")
      .single();
    if (submissionErr) throw new Error(submissionErr.message);

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
        const comment = await preservedGradeComment(
          supabaseAdmin,
          assessment.assignment_id,
          submission.student_id,
          "Assessment graded",
        );
        const { error: gradeErr } = await supabaseAdmin.from("grades").upsert(
          {
            assignment_id: assessment.assignment_id,
            student_id: submission.student_id,
            points_earned: Number(submission.auto_score) + manual,
            comment,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
        if (gradeErr) throw new Error(gradeErr.message);
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
    const { data: target } = await supabaseAdmin
      .from("assessment_submissions").select("assessment_id").eq("id", data.submissionId).maybeSingle();
    if (!target) throw new Error("Submission not found");
    await assertManagesAssessment(context.supabase as unknown as ScopedClient, supabaseAdmin, target.assessment_id);

    if (data.accepted) {
      const { data: preview, error: previewErr } = await supabaseAdmin
        .from("assessment_submissions")
        .select("auto_score, manual_score, status, assessment_id")
        .eq("id", data.submissionId)
        .maybeSingle();
      if (previewErr) throw previewErr;
      if (preview?.status === "graded") {
        const { data: linked, error: linkedErr } = await supabaseAdmin
          .from("assessments")
          .select("assignment_id")
          .eq("id", preview.assessment_id)
          .maybeSingle();
        if (linkedErr) throw linkedErr;
        if (linked?.assignment_id) {
          await assertGradeWithinColumn(
            supabaseAdmin,
            linked.assignment_id,
            Number(preview.auto_score) + Number(preview.manual_score),
          );
        }
      }
    }

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
        const comment = await preservedGradeComment(
          supabaseAdmin,
          assessment.assignment_id,
          submission.student_id,
          "Late assessment accepted",
        );
        const { error: gradeErr } = await supabaseAdmin.from("grades").upsert(
          {
            assignment_id: assessment.assignment_id,
            student_id: submission.student_id,
            points_earned: Number(submission.auto_score) + Number(submission.manual_score),
            comment,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "assignment_id,student_id" },
        );
        if (gradeErr) throw new Error(gradeErr.message);
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
    await assertManagesAnswer(context.supabase as unknown as ScopedClient, supabaseAdmin, data.answerId);
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

const missedZerosInput = z.object({ classId: z.string().uuid() });

function unwrapList<T>(result: {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}): T[] {
  if (result.error) throw apiErrorFromDb(result.error);
  return result.data ?? [];
}

/**
 * Assessments that have closed (or passed their due date) score a 0 for every
 * enrolled student who never handed anything in. Existing grades are never
 * touched, so a teacher's override always wins. A forbidden caller or a failed
 * read/write throws, so a retry is not reported as "nothing to score".
 */
export const applyMissedAssessmentZeros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseApiInput(missedZerosInput, input))
  .handler(async ({ data: input, context }) => {
    const data = parseApiInput(missedZerosInput, input);
    const { data: isStaff, error: staffErr } = await context.supabase.rpc("is_staff");
    if (staffErr) throw apiErrorFromDb(staffErr);
    if (isStaff !== true) {
      throw new ApiError("forbidden", "Only teachers and admins can record automatic zeros.");
    }
    const { data: managesClass, error: scopeErr } = await context.supabase.rpc("can_manage_class", {
      _class_id: data.classId,
    });
    if (scopeErr) throw apiErrorFromDb(scopeErr);
    if (managesClass !== true) {
      throw new ApiError("forbidden", "You can only record automatic zeros for a class you manage.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const assessments = unwrapList(
      await supabaseAdmin
        .from("assessments")
        .select("id, assignment_id, published, due_at, closes_at")
        .eq("class_id", data.classId),
    );

    const now = Date.now();
    const closed = assessments.filter((a) => {
      if (!a.published || !a.assignment_id) return false;
      const end = a.closes_at ?? a.due_at;
      return end != null && Date.parse(end) < now;
    });

    const roster = unwrapList(
      await supabaseAdmin.from("enrollments").select("student_id").eq("class_id", data.classId),
    );
    const studentIds = roster.map((r) => r.student_id);

    let zeroed = 0;
    for (const assessment of studentIds.length === 0 ? [] : closed) {
      const assignmentId = assessment.assignment_id!;

      const subs = unwrapList(
        await supabaseAdmin
          .from("assessment_submissions")
          .select("student_id")
          .eq("assessment_id", assessment.id),
      );
      const submitted = new Set(subs.map((s) => s.student_id));

      const existing = unwrapList(
        await supabaseAdmin.from("grades").select("student_id").eq("assignment_id", assignmentId),
      );
      const graded = new Set(existing.map((g) => g.student_id));

      // Students the teacher reopened get a fresh chance, not another zero,
      // until their reopened window has passed.
      const resets = unwrapList(
        await supabaseAdmin
          .from("grade_reset_log")
          .select("student_id, reopened_until")
          .eq("assignment_id", assignmentId),
      );
      const reopened = new Set(
        resets
          .filter((r) => !r.reopened_until || Date.parse(r.reopened_until) > now)
          .map((r) => r.student_id),
      );

      const targets = studentIds.filter(
        (id) => !submitted.has(id) && !graded.has(id) && !reopened.has(id),
      );
      if (targets.length === 0) continue;

      // ignoreDuplicates keeps a grade saved between the read and this write.
      const { error } = await supabaseAdmin.from("grades").upsert(
        targets.map((student_id) => ({
          assignment_id: assignmentId,
          student_id,
          points_earned: 0,
          comment: "Not completed — automatic zero",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "assignment_id,student_id", ignoreDuplicates: true },
      );
      if (error) throw apiErrorFromDb(error);
      zeroed += targets.length;
    }

    // Repair pass: graded attempts that never reached the gradebook (for
    // example the gradebook column was created after grading) get pushed in.
    // Teacher-entered grades are left untouched.
    let synced = 0;
    for (const assessment of assessments) {
      if (!assessment.assignment_id) continue;
      const assignmentId = assessment.assignment_id;
      const subs = unwrapList(
        await supabaseAdmin
          .from("assessment_submissions")
          .select("student_id, status, auto_score, manual_score, is_late, late_accepted")
          .eq("assessment_id", assessment.id)
          .eq("status", "graded"),
      );
      const countable = subs.filter((s) => !s.is_late || s.late_accepted);
      if (countable.length === 0) continue;

      const existing = unwrapList(
        await supabaseAdmin
          .from("grades")
          .select("student_id, points_earned, comment")
          .eq("assignment_id", assignmentId),
      );
      const byStudent = new Map(existing.map((g) => [g.student_id, g]));

      const { data: column, error: columnErr } = await supabaseAdmin
        .from("assignments")
        .select("points_possible, category")
        .eq("id", assignmentId)
        .maybeSingle();
      if (columnErr) throw apiErrorFromDb(columnErr);
      const rows = countable
        .map((s) => {
          const current = byStudent.get(s.student_id);
          return {
            assignment_id: assignmentId,
            student_id: s.student_id,
            points_earned: Number(s.auto_score ?? 0) + Number(s.manual_score ?? 0),
            comment:
              current?.comment && !isSystemGradeComment(current.comment)
                ? current.comment
                : "Assessment graded",
            updated_at: new Date().toISOString(),
          };
        })
        .filter((row) => {
          if (
            column &&
            scoreExceedsTotal(row.points_earned, Number(column.points_possible), column.category)
          ) {
            return false;
          }
          const current = byStudent.get(row.student_id);
          if (!current) return true;
          if (!isSystemGradeComment(current.comment)) return false;
          return Number(current.points_earned ?? -1) !== row.points_earned;
        });
      if (rows.length === 0) continue;

      const { error } = await supabaseAdmin
        .from("grades")
        .upsert(rows, { onConflict: "assignment_id,student_id" });
      if (error) throw apiErrorFromDb(error);
      synced += rows.length;
    }

    return { zeroed, synced };
  });

