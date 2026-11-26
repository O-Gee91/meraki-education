-- Run with the managed project connection: psql -X -v ON_ERROR_STOP=1 -f this-file
-- Every fixture and permission addition is rolled back, including on failure.
-- Tests use database identity claims; the managed connection cannot SET ROLE.
BEGIN;
DO $$
DECLARE
  owner_id uuid;
  colleague_id uuid;
  admin_id uuid;
  class_id uuid := gen_random_uuid();
  blocked boolean := false;
BEGIN
  IF has_function_privilege('authenticated', 'public.claim_first_admin()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_first_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Self-claim remains executable';
  END IF;
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  SELECT p.id INTO owner_id FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin')
    ORDER BY p.id LIMIT 1;
  SELECT p.id INTO colleague_id FROM public.profiles p
    WHERE p.id <> owner_id
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='admin')
    ORDER BY p.id LIMIT 1;
  IF owner_id IS NULL OR colleague_id IS NULL OR admin_id IS NULL THEN
    RAISE EXCEPTION 'Three independent existing accounts are required for rollback-only tests';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (owner_id,'teacher'),(colleague_id,'teacher')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.classes (id,name,teacher_name,teacher_id,grade_level)
    VALUES (class_id,'Security rollback test','Security Test Teacher',owner_id,7);
  INSERT INTO public.class_co_teachers (class_id,teacher_id,permission_level)
    VALUES (class_id,colleague_id,'full');

  PERFORM set_config('request.jwt.claim.sub', colleague_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',colleague_id,'role','authenticated')::text, true);
  IF NOT public.can_manage_class(class_id) THEN RAISE EXCEPTION 'Full co-teacher lost class permission'; END IF;
  UPDATE public.classes SET room='QA' WHERE id=class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Full co-teacher lost ordinary class editing'; END IF;
  BEGIN
    UPDATE public.classes SET teacher_id=colleague_id WHERE id=class_id;
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Only the primary teacher%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Co-teacher ownership takeover was allowed'; END IF;
  IF (SELECT teacher_id FROM public.classes WHERE id=class_id) IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Ownership changed despite denial';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  UPDATE public.classes SET teacher_id=colleague_id WHERE id=class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Primary teacher could not transfer ownership'; END IF;

  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  UPDATE public.classes SET teacher_id=owner_id WHERE id=class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrator could not transfer ownership'; END IF;
  RAISE NOTICE 'PASS: self-claim denied, co-teacher editing retained, takeover blocked, owner and administrator transfers retained';
END;
$$;
ROLLBACK;