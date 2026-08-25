CREATE TABLE public.proofread_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  symbol text NOT NULL DEFAULT '',
  label text NOT NULL,
  meaning text,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proofread_marks_code_unique UNIQUE (code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proofread_marks TO authenticated;
GRANT ALL ON public.proofread_marks TO service_role;
ALTER TABLE public.proofread_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view proofread marks"
  ON public.proofread_marks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add proofread marks"
  ON public.proofread_marks FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff can edit proofread marks"
  ON public.proofread_marks FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff can delete proofread marks"
  ON public.proofread_marks FOR DELETE TO authenticated USING (public.is_staff());

CREATE TRIGGER touch_proofread_marks BEFORE UPDATE ON public.proofread_marks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.submission_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  mark_code text,
  mark_symbol text,
  mark_label text,
  excerpt text NOT NULL DEFAULT '',
  start_offset integer,
  end_offset integer,
  comment text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submission_annotations_submission_idx ON public.submission_annotations(submission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_annotations TO authenticated;
GRANT ALL ON public.submission_annotations TO service_role;
ALTER TABLE public.submission_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and the student can read annotations"
  ON public.submission_annotations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assignment_submissions s
    WHERE s.id = submission_id AND public.can_view_student(s.student_id)
  ));
CREATE POLICY "Staff can add annotations"
  ON public.submission_annotations FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "Staff can edit annotations"
  ON public.submission_annotations FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Staff can delete annotations"
  ON public.submission_annotations FOR DELETE TO authenticated USING (public.is_staff());

CREATE TRIGGER touch_submission_annotations BEFORE UPDATE ON public.submission_annotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.proofread_marks (code, symbol, label, meaning, sort_order) VALUES
  ('ins', '^', 'Insert', 'Add the missing word, letter or phrase here.', 10),
  ('del', 'ꝺ', 'Delete', 'Remove this word or punctuation.', 20),
  ('para', '¶', 'New paragraph', 'Begin a new paragraph here.', 30),
  ('sp', 'sp', 'Spelling', 'This word is misspelled.', 40),
  ('cap', '≡', 'Capitalize', 'Use a capital letter.', 50),
  ('lc', '/', 'Lowercase', 'Use a lowercase letter.', 60),
  ('punct', '⊙', 'Punctuation', 'Punctuation is missing or incorrect.', 70),
  ('wc', 'wc', 'Word choice', 'Choose a clearer or stronger word.', 80),
  ('awk', 'awk', 'Awkward', 'This phrasing is awkward — rewrite it.', 90),
  ('frag', 'frag', 'Fragment', 'This is not a complete sentence.', 100),
  ('ro', 'RO', 'Run-on', 'Two or more sentences are joined incorrectly.', 110),
  ('tr', '∼', 'Transpose', 'Reverse the order of these letters or words.', 120),
  ('closeup', '⌒', 'Close up', 'Remove the space between these characters.', 130),
  ('space', '#', 'Add space', 'Insert a space here.', 140),
  ('unclear', '?', 'Unclear', 'The meaning is not clear to the reader.', 150),
  ('good', '✓', 'Well done', 'Strong writing — keep doing this.', 160);
