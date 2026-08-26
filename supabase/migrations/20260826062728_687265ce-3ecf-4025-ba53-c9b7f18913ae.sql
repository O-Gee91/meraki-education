ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS teacher_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS grade_level integer;

UPDATE public.classes c
SET teacher_name = COALESCE(NULLIF(btrim(p.full_name), ''), 'Unassigned')
FROM public.profiles p
WHERE p.id = c.teacher_id AND btrim(c.teacher_name) = '';

UPDATE public.classes SET teacher_name = 'Unassigned' WHERE btrim(teacher_name) = '';

CREATE OR REPLACE FUNCTION public.validate_class()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.teacher_name := btrim(COALESCE(NEW.teacher_name, ''));
  IF length(NEW.teacher_name) < 2 OR length(NEW.teacher_name) > 120 THEN
    RAISE EXCEPTION 'A teacher name is required for every class';
  END IF;
  IF NEW.grade_level IS NOT NULL AND (NEW.grade_level < 1 OR NEW.grade_level > 12) THEN
    RAISE EXCEPTION 'Grade level must be between 1 and 12';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_class_trg ON public.classes;
CREATE TRIGGER validate_class_trg
BEFORE INSERT OR UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.validate_class();