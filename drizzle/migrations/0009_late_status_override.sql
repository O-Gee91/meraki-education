ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_override_by uuid,
  ADD COLUMN IF NOT EXISTS late_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_override_reason text,
  ADD COLUMN IF NOT EXISTS late_penalty_override_pct numeric;

CREATE OR REPLACE FUNCTION public.submission_is_late(_assignment_id uuid, _submitted_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT _submitted_at > (((a.due_date + 1)::timestamp) AT TIME ZONE COALESCE(c.timezone, 'Asia/Shanghai'))
    FROM public.assignments a JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = _assignment_id AND a.due_date IS NOT NULL
  ), false);
$$;

UPDATE public.assignment_submissions s
   SET is_late = public.submission_is_late(s.assignment_id, s.submitted_at);

CREATE OR REPLACE FUNCTION public.guard_submission_late_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE staff boolean := auth.uid() IS NULL OR public.is_staff();
BEGIN
  IF TG_OP = 'UPDATE' AND NOT staff AND (
       NEW.late_override_by IS DISTINCT FROM OLD.late_override_by
    OR NEW.late_override_at IS DISTINCT FROM OLD.late_override_at
    OR NEW.late_override_reason IS DISTINCT FROM OLD.late_override_reason
    OR NEW.late_penalty_override_pct IS DISTINCT FROM OLD.late_penalty_override_pct) THEN
    RAISE EXCEPTION 'Only teachers and admins can change late status';
  END IF;
  IF TG_OP = 'INSERT' AND NOT staff THEN
    NEW.late_override_by := NULL; NEW.late_override_at := NULL;
    NEW.late_override_reason := NULL; NEW.late_penalty_override_pct := NULL;
  END IF;
  -- Late status is automatic unless a teacher has overridden it.
  IF NEW.late_override_at IS NULL AND (NOT staff OR TG_OP = 'INSERT'
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.is_late IS NOT DISTINCT FROM OLD.is_late) THEN
    NEW.is_late := public.submission_is_late(NEW.assignment_id, NEW.submitted_at);
  ELSIF NEW.late_override_at IS NOT NULL AND NOT staff AND TG_OP = 'UPDATE' THEN
    NEW.is_late := OLD.is_late;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_submission_late_fields_trg ON public.assignment_submissions;
CREATE TRIGGER guard_submission_late_fields_trg
  BEFORE INSERT OR UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_submission_late_fields();

CREATE TABLE public.override_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  old_value boolean NOT NULL,
  new_value boolean NOT NULL,
  reason text,
  penalty_override_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX override_audit_log_submission_idx ON public.override_audit_log(submission_id);
GRANT SELECT ON public.override_audit_log TO authenticated;
GRANT ALL ON public.override_audit_log TO service_role;
ALTER TABLE public.override_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY override_audit_log_select ON public.override_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignment_submissions s
                 WHERE s.id = submission_id AND public.can_manage_student(s.student_id)));

CREATE OR REPLACE FUNCTION public.override_late_status(_submission_id uuid, _on_time boolean, _reason text, _penalty_pct numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sub record; r text := NULLIF(btrim(COALESCE(_reason,'')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only teachers and admins can override late status';
  END IF;
  SELECT * INTO sub FROM public.assignment_submissions WHERE id = _submission_id;
  IF sub IS NULL OR NOT public.can_manage_student(sub.student_id) THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF sub.is_late = (NOT _on_time) AND _penalty_pct IS NOT DISTINCT FROM sub.late_penalty_override_pct THEN
    RETURN;
  END IF;
  IF sub.is_late <> (NOT _on_time) AND r IS NULL THEN
    RAISE EXCEPTION 'A reason is required when changing late status';
  END IF;
  IF r IS NOT NULL AND length(r) > 1000 THEN RAISE EXCEPTION 'Reason too long'; END IF;
  IF _penalty_pct IS NOT NULL AND (_penalty_pct < 0 OR _penalty_pct > 100) THEN
    RAISE EXCEPTION 'Penalty must be between 0 and 100';
  END IF;
  UPDATE public.assignment_submissions
     SET is_late = NOT _on_time, late_override_by = auth.uid(), late_override_at = now(),
         late_override_reason = r, late_penalty_override_pct = _penalty_pct
   WHERE id = _submission_id;
  INSERT INTO public.override_audit_log (submission_id, user_id, old_value, new_value, reason, penalty_override_pct)
  VALUES (_submission_id, auth.uid(), sub.is_late, NOT _on_time, r, _penalty_pct);
END;
$$;
REVOKE ALL ON FUNCTION public.override_late_status(uuid, boolean, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.override_late_status(uuid, boolean, text, numeric) TO authenticated;