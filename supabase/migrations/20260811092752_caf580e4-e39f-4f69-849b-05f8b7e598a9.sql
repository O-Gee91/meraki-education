-- classes weights
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS weights jsonb NOT NULL DEFAULT '{}'::jsonb;

-- GROUPS
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'club',
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'school',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups read" ON public.groups FOR SELECT TO authenticated
  USING (visibility = 'school' OR public.is_staff());
CREATE POLICY "groups insert staff" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND created_by = auth.uid());
CREATE POLICY "groups update staff" ON public.groups FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "groups delete staff" ON public.groups FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group members read" ON public.group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "group members join" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "group members leave" ON public.group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- POSTS
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  link text,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read" ON public.posts FOR SELECT TO authenticated
  USING (
    (class_id IS NOT NULL AND public.can_view_class(class_id))
    OR (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = group_id AND (g.visibility = 'school' OR public.is_staff())
    ))
  );
CREATE POLICY "posts insert" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      (class_id IS NOT NULL AND public.can_view_class(class_id))
      OR (group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.groups g WHERE g.id = group_id AND (g.visibility = 'school' OR public.is_staff())
      ))
    )
  );
CREATE POLICY "posts update own or staff" ON public.posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff())
  WITH CHECK (author_id = auth.uid() OR public.is_staff());
CREATE POLICY "posts delete own or staff" ON public.posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff());

CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.post_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id));
CREATE POLICY "comments insert" ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id));
CREATE POLICY "comments delete own or staff" ON public.post_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff());

-- EMOTIONAL CHECK-INS
CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  mood integer NOT NULL DEFAULT 3,
  note text,
  staff_note text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkins TO authenticated;
GRANT ALL ON public.checkins TO service_role;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins read" ON public.checkins FOR SELECT TO authenticated
  USING (public.can_view_student(student_id));
CREATE POLICY "checkins insert" ON public.checkins FOR INSERT TO authenticated
  WITH CHECK (public.can_view_student(student_id));
CREATE POLICY "checkins update staff" ON public.checkins FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "checkins delete staff" ON public.checkins FOR DELETE TO authenticated
  USING (public.is_staff());

-- POLLS
CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  question text NOT NULL,
  options text[] NOT NULL DEFAULT '{}',
  share_results boolean NOT NULL DEFAULT true,
  closed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.polls TO authenticated;
GRANT ALL ON public.polls TO service_role;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polls read" ON public.polls FOR SELECT TO authenticated
  USING (public.can_view_class(class_id));
CREATE POLICY "polls insert staff" ON public.polls FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "polls update staff" ON public.polls FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "polls delete staff" ON public.polls FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE TABLE public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poll_votes TO authenticated;
GRANT ALL ON public.poll_votes TO service_role;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poll votes read" ON public.poll_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff() OR EXISTS (
    SELECT 1 FROM public.polls p WHERE p.id = poll_id AND p.share_results AND public.can_view_class(p.class_id)
  ));
CREATE POLICY "poll votes insert" ON public.poll_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.polls p WHERE p.id = poll_id AND NOT p.closed AND public.can_view_class(p.class_id)
  ));
CREATE POLICY "poll votes update own" ON public.poll_votes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "poll votes delete own" ON public.poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- SEATING PLAN
CREATE TABLE public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  row_index integer NOT NULL DEFAULT 0,
  col_index integer NOT NULL DEFAULT 0,
  UNIQUE (class_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seats TO authenticated;
GRANT ALL ON public.seats TO service_role;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seats read" ON public.seats FOR SELECT TO authenticated
  USING (public.can_view_class(class_id));
CREATE POLICY "seats insert staff" ON public.seats FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "seats update staff" ON public.seats FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "seats delete staff" ON public.seats FOR DELETE TO authenticated
  USING (public.is_staff());

-- STANDARDS
CREATE TABLE public.standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  subject text,
  grade_level integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standards TO authenticated;
GRANT ALL ON public.standards TO service_role;
ALTER TABLE public.standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standards read" ON public.standards FOR SELECT TO authenticated USING (true);
CREATE POLICY "standards insert staff" ON public.standards FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "standards update staff" ON public.standards FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "standards delete staff" ON public.standards FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE TABLE public.assignment_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES public.standards(id) ON DELETE CASCADE,
  UNIQUE (assignment_id, standard_id)
);
GRANT SELECT, INSERT, DELETE ON public.assignment_standards TO authenticated;
GRANT ALL ON public.assignment_standards TO service_role;
ALTER TABLE public.assignment_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment standards read" ON public.assignment_standards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND public.can_view_class(a.class_id)));
CREATE POLICY "assignment standards insert staff" ON public.assignment_standards FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "assignment standards delete staff" ON public.assignment_standards FOR DELETE TO authenticated
  USING (public.is_staff());

-- PORTFOLIOS
CREATE TABLE public.portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  link text,
  kind text NOT NULL DEFAULT 'artifact',
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolio_items TO service_role;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio read" ON public.portfolio_items FOR SELECT TO authenticated
  USING (public.can_view_student(student_id));
CREATE POLICY "portfolio insert" ON public.portfolio_items FOR INSERT TO authenticated
  WITH CHECK (public.can_view_student(student_id));
CREATE POLICY "portfolio update" ON public.portfolio_items FOR UPDATE TO authenticated
  USING (public.is_staff() OR added_by = auth.uid())
  WITH CHECK (public.is_staff() OR added_by = auth.uid());
CREATE POLICY "portfolio delete" ON public.portfolio_items FOR DELETE TO authenticated
  USING (public.is_staff() OR added_by = auth.uid());

-- REPORT CARDS
CREATE TABLE public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  term text NOT NULL DEFAULT 'Fall 2026',
  grade_pct numeric,
  letter text,
  comment text,
  published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id, term)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_cards TO authenticated;
GRANT ALL ON public.report_cards TO service_role;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report cards read" ON public.report_cards FOR SELECT TO authenticated
  USING (public.is_staff() OR (published AND public.can_view_student(student_id)));
CREATE POLICY "report cards insert staff" ON public.report_cards FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "report cards update staff" ON public.report_cards FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "report cards delete staff" ON public.report_cards FOR DELETE TO authenticated
  USING (public.is_staff());

INSERT INTO public.standards (code, description, subject, grade_level) VALUES
  ('MATH.6.RP.1', 'Understand the concept of a ratio and use ratio language to describe a relationship.', 'Mathematics', 6),
  ('MATH.7.EE.2', 'Rewrite an expression in different forms to show how quantities are related.', 'Mathematics', 7),
  ('ELA.6.RL.2', 'Determine a theme or central idea of a text and how it is conveyed through details.', 'English', 6),
  ('ELA.7.W.1', 'Write arguments to support claims with clear reasons and relevant evidence.', 'English', 7),
  ('SCI.6.MS-PS1-1', 'Develop models to describe the atomic composition of simple molecules.', 'Science', 6),
  ('SOC.7.H.2', 'Analyse causes and consequences of historical events using primary sources.', 'Social Studies', 7);