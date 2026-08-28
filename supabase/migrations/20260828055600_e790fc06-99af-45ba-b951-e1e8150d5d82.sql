-- 1. Staff-only check-in follow-up notes
CREATE TABLE public.checkin_staff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL UNIQUE REFERENCES public.checkins(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkin_staff_notes TO authenticated;
GRANT ALL ON public.checkin_staff_notes TO service_role;

ALTER TABLE public.checkin_staff_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkin staff notes read" ON public.checkin_staff_notes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_manage_student(c.student_id)));

CREATE POLICY "checkin staff notes insert" ON public.checkin_staff_notes
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_manage_student(c.student_id)));

CREATE POLICY "checkin staff notes update" ON public.checkin_staff_notes
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_manage_student(c.student_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_manage_student(c.student_id)));

CREATE POLICY "checkin staff notes delete" ON public.checkin_staff_notes
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.checkins c WHERE c.id = checkin_id AND public.can_manage_student(c.student_id)));

CREATE TRIGGER touch_checkin_staff_notes
BEFORE UPDATE ON public.checkin_staff_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.checkin_staff_notes (checkin_id, note)
SELECT id, staff_note FROM public.checkins
WHERE staff_note IS NOT NULL AND btrim(staff_note) <> '';

ALTER TABLE public.checkins DROP COLUMN staff_note;

-- 2. Poll votes: no cross-student identity exposure
DROP POLICY IF EXISTS "poll votes read" ON public.poll_votes;

CREATE POLICY "poll votes read" ON public.poll_votes
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.polls p WHERE p.id = poll_id AND public.can_manage_class(p.class_id))
);

CREATE OR REPLACE FUNCTION public.poll_results(_poll_id uuid)
RETURNS TABLE (option_index int, votes bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = _poll_id
      AND (p.share_results OR public.can_manage_class(p.class_id))
      AND public.can_view_class(p.class_id)
  ) THEN
    RAISE EXCEPTION 'Results are not available';
  END IF;

  RETURN QUERY
  SELECT v.option_index, count(*)::bigint
  FROM public.poll_votes v
  WHERE v.poll_id = _poll_id
  GROUP BY v.option_index
  ORDER BY v.option_index;
END;
$$;

REVOKE ALL ON FUNCTION public.poll_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_results(uuid) TO authenticated;