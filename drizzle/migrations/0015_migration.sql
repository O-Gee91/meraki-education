INSERT INTO public.enrollments (class_id, student_id)
SELECT c.id, s.id FROM public.classes c
CROSS JOIN (SELECT id FROM public.students WHERE is_tester ORDER BY created_at LIMIT 1) s
ON CONFLICT (class_id, student_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enroll_tester_in_new_class()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tid uuid;
BEGIN
  SELECT id INTO tid FROM public.students WHERE is_tester ORDER BY created_at LIMIT 1;
  IF tid IS NOT NULL THEN
    INSERT INTO public.enrollments (class_id, student_id) VALUES (NEW.id, tid)
    ON CONFLICT (class_id, student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS enroll_tester_on_class_insert ON public.classes;
CREATE TRIGGER enroll_tester_on_class_insert AFTER INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.enroll_tester_in_new_class();