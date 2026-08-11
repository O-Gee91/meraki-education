-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','teacher','student','parent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "self role claim" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND role <> 'admin');

-- Students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  grade_level int NOT NULL DEFAULT 6,
  student_number text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guardian_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guardian_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
  );
$$;

CREATE POLICY "students read" ON public.students FOR SELECT TO authenticated
  USING (public.is_staff() OR user_id = auth.uid() OR guardian_user_id = auth.uid());
CREATE POLICY "students write staff" ON public.students FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "students update staff" ON public.students FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "students delete admin" ON public.students FOR DELETE TO authenticated USING (public.is_admin());

-- Classes
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  period text,
  room text,
  term text NOT NULL DEFAULT 'Fall 2026',
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() OR EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
    WHERE e.class_id = _class_id AND (s.user_id = auth.uid() OR s.guardian_user_id = auth.uid())
  );
$$;

CREATE POLICY "classes read" ON public.classes FOR SELECT TO authenticated USING (public.can_view_class(id));
CREATE POLICY "classes insert staff" ON public.classes FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "classes update staff" ON public.classes FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "classes delete admin" ON public.classes FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "enrollments read" ON public.enrollments FOR SELECT TO authenticated
  USING (public.is_staff() OR public.can_view_student(student_id));
CREATE POLICY "enrollments write staff" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "enrollments delete staff" ON public.enrollments FOR DELETE TO authenticated USING (public.is_staff());

-- Assignments and grades
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Homework',
  points_possible numeric NOT NULL DEFAULT 100,
  due_date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments read" ON public.assignments FOR SELECT TO authenticated USING (public.can_view_class(class_id));
CREATE POLICY "assignments insert staff" ON public.assignments FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "assignments update staff" ON public.assignments FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "assignments delete staff" ON public.assignments FOR DELETE TO authenticated USING (public.is_staff());

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  points_earned numeric,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grades read" ON public.grades FOR SELECT TO authenticated USING (public.can_view_student(student_id));
CREATE POLICY "grades insert staff" ON public.grades FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "grades update staff" ON public.grades FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "grades delete staff" ON public.grades FOR DELETE TO authenticated USING (public.is_staff());

-- Attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'present',
  note text,
  UNIQUE (class_id, student_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance read" ON public.attendance FOR SELECT TO authenticated USING (public.can_view_student(student_id));
CREATE POLICY "attendance insert staff" ON public.attendance FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "attendance update staff" ON public.attendance FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "attendance delete staff" ON public.attendance FOR DELETE TO authenticated USING (public.is_staff());

-- Behavior
CREATE TABLE public.behavior_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  kind text NOT NULL DEFAULT 'positive',
  severity int NOT NULL DEFAULT 1,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_notes TO authenticated;
GRANT ALL ON public.behavior_notes TO service_role;
ALTER TABLE public.behavior_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behavior read" ON public.behavior_notes FOR SELECT TO authenticated USING (public.can_view_student(student_id));
CREATE POLICY "behavior insert staff" ON public.behavior_notes FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "behavior update staff" ON public.behavior_notes FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "behavior delete staff" ON public.behavior_notes FOR DELETE TO authenticated USING (public.is_staff());

-- Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements read" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements insert staff" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND author_id = auth.uid());
CREATE POLICY "announcements update staff" ON public.announcements FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "announcements delete staff" ON public.announcements FOR DELETE TO authenticated USING (public.is_staff());

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages read own" ON public.messages FOR SELECT TO authenticated USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY "messages send" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages mark read" ON public.messages FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Enrollment applications
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  grade_level int NOT NULL DEFAULT 6,
  guardian_name text NOT NULL,
  guardian_email text NOT NULL,
  phone text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.applications TO anon;
GRANT SELECT, INSERT, UPDATE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications submit public" ON public.applications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "applications read admin" ON public.applications FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "applications update admin" ON public.applications FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_cents int NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated USING (public.can_view_student(student_id));
CREATE POLICY "invoices insert admin" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "invoices update admin" ON public.invoices FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "invoices delete admin" ON public.invoices FOR DELETE TO authenticated USING (public.is_admin());

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'teacher'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();