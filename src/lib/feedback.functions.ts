import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAutoGradeComment } from "@/lib/grading";

export type FeedbackItem = {
  id: string;
  /** Where the feedback was written. */
  kind: "grade" | "note" | "mark" | "rubric" | "answer";
  classId: string | null;
  className: string;
  /** Assignment or assessment the feedback belongs to. */
  title: string;
  /** Optional second line (question prompt, proofreading mark, …). */
  subtitle: string | null;
  body: string;
  at: string;
  studentName: string | null;
};

type ClassRef = { name: string } | null;
type WorkRef = { title: string; class_id: string; classes: ClassRef } | null;

function classOf(work: WorkRef) {
  return {
    classId: work?.class_id ?? null,
    className: work?.classes?.name ?? "Class",
    title: work?.title ?? "Coursework",
  };
}

/**
 * Everything a teacher has written for the signed-in student (or, for a
 * guardian, their children). Runs as the caller, so row-level security keeps
 * each family to their own rows; only question prompts need the admin client
 * because the question bank is staff-only.
 */
export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedbackItem[]> => {
    const { data: students, error: sErr } = await context.supabase
      .from("students")
      .select("id, first_name, last_name, user_id, guardian_user_id");
    if (sErr) throw sErr;

    const mine = (students ?? []).filter(
      (s) => s.user_id === context.userId || s.guardian_user_id === context.userId,
    );
    if (mine.length === 0) return [];

    const ids = mine.map((s) => s.id);
    const nameOf = (studentId: string) => {
      if (mine.length < 2) return null;
      const s = mine.find((row) => row.id === studentId);
      return s ? `${s.first_name} ${s.last_name}` : null;
    };

    const items: FeedbackItem[] = [];

    /* ---- written comments left with a score ---- */
    const { data: grades } = await context.supabase
      .from("grades")
      .select(
        "id, comment, updated_at, student_id, assignments(title, class_id, classes(name))",
      )
      .in("student_id", ids)
      .not("comment", "is", null);

    for (const g of grades ?? []) {
      const comment = (g.comment ?? "").trim();
      // Internal notes the system writes for itself ("MARK:xx" special marks,
      // auto-zeroes, graded-assessment sync) are not teacher feedback.
      if (!comment || isAutoGradeComment(comment)) continue;
      const ref = classOf(g.assignments as WorkRef);
      items.push({
        id: `grade-${g.id}`,
        kind: "grade",
        ...ref,
        subtitle: null,
        body: comment,
        at: g.updated_at,
        studentName: nameOf(g.student_id),
      });
    }

    /* ---- overall comments on a hand-in, plus proofreading marks ---- */
    const { data: submissions } = await context.supabase
      .from("assignment_submissions")
      .select(
        "id, teacher_note, updated_at, student_id, assignments(title, class_id, classes(name))",
      )
      .in("student_id", ids);

    const submissionById = new Map(
      (submissions ?? []).map((s) => [s.id, s] as const),
    );

    for (const s of submissions ?? []) {
      const note = (s.teacher_note ?? "").trim();
      if (!note) continue;
      items.push({
        id: `note-${s.id}`,
        kind: "note",
        ...classOf(s.assignments as WorkRef),
        subtitle: null,
        body: note,
        at: s.updated_at,
        studentName: nameOf(s.student_id),
      });
    }

    if (submissionById.size > 0) {
      const { data: annotations } = await context.supabase
        .from("submission_annotations")
        .select("id, submission_id, mark_label, mark_symbol, excerpt, comment, created_at")
        .in("submission_id", [...submissionById.keys()]);

      for (const a of annotations ?? []) {
        const body = (a.comment ?? "").trim() || (a.mark_label ?? "").trim();
        if (!body) continue;
        const parent = submissionById.get(a.submission_id);
        items.push({
          id: `mark-${a.id}`,
          kind: "mark",
          ...classOf((parent?.assignments ?? null) as WorkRef),
          subtitle: a.excerpt ? `“${a.excerpt}”` : (a.mark_symbol ?? null),
          body,
          at: a.created_at,
          studentName: parent ? nameOf(parent.student_id) : null,
        });
      }
    }

    /* ---- rubric comments ---- */
    const { data: rubricScores } = await context.supabase
      .from("rubric_scores")
      .select(
        "id, comment, updated_at, student_id, assignments(title, class_id, classes(name))",
      )
      .in("student_id", ids)
      .not("comment", "is", null);

    for (const r of rubricScores ?? []) {
      const comment = (r.comment ?? "").trim();
      if (!comment) continue;
      items.push({
        id: `rubric-${r.id}`,
        kind: "rubric",
        ...classOf(r.assignments as WorkRef),
        subtitle: "Rubric feedback",
        body: comment,
        at: r.updated_at,
        studentName: nameOf(r.student_id),
      });
    }

    /* ---- per-question feedback on quizzes, tests and essays ---- */
    const { data: attempts } = await context.supabase
      .from("assessment_submissions")
      .select("id, student_id, assessments(title, class_id, classes(name))")
      .in("student_id", ids);

    const attemptById = new Map((attempts ?? []).map((a) => [a.id, a] as const));

    if (attemptById.size > 0) {
      const { data: answers } = await context.supabase
        .from("assessment_answers")
        .select("id, submission_id, question_id, feedback, points_awarded, updated_at")
        .in("submission_id", [...attemptById.keys()])
        .not("feedback", "is", null);

      const withFeedback = (answers ?? []).filter((a) => (a.feedback ?? "").trim().length > 0);

      let prompts = new Map<string, string>();
      if (withFeedback.length > 0) {
        // The question bank is staff-only, so the prompt text is fetched here
        // and handed back without any answer key.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: questions } = await supabaseAdmin
          .from("assessment_questions")
          .select("id, prompt")
          .in("id", [...new Set(withFeedback.map((a) => a.question_id))]);
        prompts = new Map((questions ?? []).map((q) => [q.id, q.prompt] as const));
      }

      for (const a of withFeedback) {
        const parent = attemptById.get(a.submission_id);
        const work = (parent?.assessments ?? null) as WorkRef;
        items.push({
          id: `answer-${a.id}`,
          kind: "answer",
          ...classOf(work),
          subtitle: prompts.get(a.question_id) ?? null,
          body: (a.feedback ?? "").trim(),
          at: a.updated_at,
          studentName: parent ? nameOf(parent.student_id) : null,
        });
      }
    }

    return items
      .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
      .slice(0, 100);
  });
