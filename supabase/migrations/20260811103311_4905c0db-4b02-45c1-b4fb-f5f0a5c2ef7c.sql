CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text,
  kind text NOT NULL DEFAULT 'quiz',
  time_limit_minutes integer,
  available_from timestamptz,
  due_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  grammar_check_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage assessments" ON public.assessments FOR ALL TO authenticated
  USING (public.is_staff() AND public.can_view_class(class_id))
  WITH CHECK (public.is_staff() AND public.can_view_class(class_id));
CREATE POLICY "Class members view published assessments" ON public.assessments FOR SELECT TO authenticated
  USING (published AND public.can_view_class(class_id));

CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'multiple_choice',
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_key jsonb NOT NULL DEFAULT '{}'::jsonb,
  points numeric NOT NULL DEFAULT 1,
  rubric text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_questions TO authenticated;
GRANT ALL ON public.assessment_questions TO service_role;
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage assessment questions" ON public.assessment_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_staff() AND public.can_view_class(a.class_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_staff() AND public.can_view_class(a.class_id)));

CREATE TABLE public.assessment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted',
  auto_score numeric NOT NULL DEFAULT 0,
  manual_score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_submissions TO authenticated;
GRANT ALL ON public.assessment_submissions TO service_role;
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage submissions" ON public.assessment_submissions FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Families view own submissions" ON public.assessment_submissions FOR SELECT TO authenticated
  USING (public.can_view_student(student_id));

CREATE TABLE public.assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assessment_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_correct boolean,
  points_awarded numeric,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_answers TO authenticated;
GRANT ALL ON public.assessment_answers TO service_role;
ALTER TABLE public.assessment_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage answers" ON public.assessment_answers FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Families view own answers" ON public.assessment_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id AND public.can_view_student(s.student_id)));

CREATE TABLE public.essay_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL REFERENCES public.assessment_answers(id) ON DELETE CASCADE,
  summary text,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_points numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.essay_reviews TO authenticated;
GRANT ALL ON public.essay_reviews TO service_role;
ALTER TABLE public.essay_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage essay reviews" ON public.essay_reviews FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Families view own essay reviews" ON public.essay_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assessment_answers ans
    JOIN public.assessment_submissions s ON s.id = ans.submission_id
    WHERE ans.id = answer_id AND public.can_view_student(s.student_id)
  ));

CREATE TRIGGER touch_assessments BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_assessment_questions BEFORE UPDATE ON public.assessment_questions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_assessment_submissions BEFORE UPDATE ON public.assessment_submissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_assessment_answers BEFORE UPDATE ON public.assessment_answers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_assessments_class ON public.assessments(class_id);
CREATE INDEX idx_assessment_questions_assessment ON public.assessment_questions(assessment_id, position);
CREATE INDEX idx_assessment_submissions_assessment ON public.assessment_submissions(assessment_id);
CREATE INDEX idx_assessment_answers_submission ON public.assessment_answers(submission_id);