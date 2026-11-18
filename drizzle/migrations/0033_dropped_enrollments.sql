CREATE TABLE public.dropped_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  enrolled_at timestamptz,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  dropped_by uuid
);
CREATE INDEX dropped_enrollments_class_idx ON public.dropped_enrollments(class_id);
CREATE INDEX dropped_enrollments_student_idx ON public.dropped_enrollments(student_id);
GRANT SELECT ON public.dropped_enrollments TO authenticated;
GRANT ALL ON public.dropped_enrollments TO service_role;
ALTER TABLE public.dropped_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View dropped enrollments" ON public.dropped_enrollments FOR SELECT TO authenticated
  USING (public.can_manage_class(class_id) OR public.can_view_student(student_id));

CREATE OR REPLACE FUNCTION public.archive_dropped_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.dropped_enrollments(class_id, student_id, enrolled_at, dropped_by)
  VALUES (OLD.class_id, OLD.student_id, OLD.created_at, auth.uid());
  RETURN OLD;
END $$;
CREATE TRIGGER enrollments_archive_on_delete AFTER DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.archive_dropped_enrollment();

CREATE OR REPLACE FUNCTION public.clear_dropped_on_reenroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.dropped_enrollments WHERE class_id = NEW.class_id AND student_id = NEW.student_id;
  RETURN NEW;
END $$;
CREATE TRIGGER enrollments_clear_dropped AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.clear_dropped_on_reenroll();

INSERT INTO public.dropped_enrollments(class_id, student_id, enrolled_at, dropped_at)
SELECT a.class_id, x.student_id, min(x.at), max(x.at)
FROM (
  SELECT assignment_id, student_id, updated_at AS at FROM public.grades
  UNION ALL
  SELECT assignment_id, student_id, submitted_at FROM public.assignment_submissions
) x
JOIN public.assignments a ON a.id = x.assignment_id
WHERE NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = a.class_id AND e.student_id = x.student_id)
GROUP BY a.class_id, x.student_id;