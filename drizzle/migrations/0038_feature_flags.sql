CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'staff_only', 'pilot_only')),
  target_user_ids uuid[] NOT NULL DEFAULT '{}',
  target_class_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators manage feature switches" ON public.feature_flags FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE FUNCTION public.stamp_feature_flag_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_feature_flag_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_feature_flag_change BEFORE INSERT OR UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.stamp_feature_flag_change();
CREATE FUNCTION public.evaluated_feature_flags(_assignment_id uuid DEFAULT NULL, _submission_id uuid DEFAULT NULL)
RETURNS TABLE(key text, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH requested_class AS (
    SELECT a.class_id FROM public.assignments a
    WHERE a.id = COALESCE(_assignment_id, (SELECT s.assignment_id FROM public.assignment_submissions s WHERE s.id = _submission_id))
      AND public.can_view_class(a.class_id)
  )
  SELECT f.key, f.enabled AND (
    f.scope = 'all'
    OR (f.scope = 'staff_only' AND public.is_staff())
    OR (f.scope = 'pilot_only' AND (
      auth.uid() = ANY(f.target_user_ids)
      OR EXISTS (SELECT 1 FROM requested_class c WHERE c.class_id = ANY(f.target_class_ids))
    ))
  ) FROM public.feature_flags f WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.evaluated_feature_flags(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluated_feature_flags(uuid, uuid) TO authenticated, service_role;