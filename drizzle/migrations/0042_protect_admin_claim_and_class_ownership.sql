CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO service_role;
COMMENT ON FUNCTION public.claim_first_admin() IS 'Disabled: administrator access requires independent authorized provisioning.';

CREATE OR REPLACE FUNCTION public.guard_class_owner_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
     AND NOT public.is_admin()
     AND OLD.teacher_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the primary teacher or an administrator can change class ownership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_class_owner_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_class_owner_change() TO authenticated, service_role;
CREATE TRIGGER guard_class_owner_change_trg
BEFORE UPDATE OF teacher_id ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.guard_class_owner_change();