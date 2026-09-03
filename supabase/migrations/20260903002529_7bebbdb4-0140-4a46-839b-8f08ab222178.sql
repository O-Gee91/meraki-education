CREATE OR REPLACE FUNCTION public.is_school_staff_email(_email text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(btrim(coalesce(_email,''))) ~ '@ssbs[0-9]?\.sh\.cn$';
$function$;

CREATE OR REPLACE FUNCTION public.grant_teacher_on_verified_school_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act on the one-time email confirmation transition. User metadata is
  -- self-editable (auth.updateUser), so it must never be trusted after the
  -- account has an active session.
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_user_meta_data->>'role') IN ('educator','teacher')
     AND public.is_school_staff_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'teacher')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;