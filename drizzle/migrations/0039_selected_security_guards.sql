CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT (auth.role() = 'service_role' OR _user_id = auth.uid() OR public.is_admin())
 AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.guard_submission_late_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE staff boolean := auth.uid() IS NULL OR public.is_staff();
BEGIN
 IF NOT staff THEN
  IF TG_OP = 'INSERT' THEN
   NEW.submitted_at := statement_timestamp();
   NEW.created_at := statement_timestamp();
  ELSIF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR (OLD.status = 'draft' AND NEW.status <> 'draft') THEN
   NEW.submitted_at := statement_timestamp();
  END IF;
 END IF;
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

CREATE TABLE public.recovery_email_limits (
 key_hash text PRIMARY KEY,
 last_requested_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.recovery_email_limits TO service_role;
ALTER TABLE public.recovery_email_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_recovery_email(_key_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE claimed text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _key_hash !~ '^[a-f0-9]{64}$' THEN
  RETURN false;
 END IF;
 INSERT INTO public.recovery_email_limits (key_hash, last_requested_at)
 VALUES (_key_hash, statement_timestamp())
 ON CONFLICT (key_hash) DO UPDATE SET last_requested_at = EXCLUDED.last_requested_at
 WHERE recovery_email_limits.last_requested_at <= statement_timestamp() - interval '15 minutes'
 RETURNING key_hash INTO claimed;
 RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_recovery_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recovery_email(text) TO service_role;