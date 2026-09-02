ALTER TABLE public.hero_profiles ADD COLUMN IF NOT EXISTS class_changes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.enforce_hero_class_change_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hero_class IS DISTINCT FROM OLD.hero_class THEN
    IF OLD.class_changes >= 3 THEN
      RAISE EXCEPTION 'You have used all 3 character class changes';
    END IF;
    NEW.class_changes := OLD.class_changes + 1;
  ELSE
    NEW.class_changes := OLD.class_changes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hero_class_change_limit ON public.hero_profiles;
CREATE TRIGGER hero_class_change_limit
BEFORE UPDATE ON public.hero_profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_hero_class_change_limit();