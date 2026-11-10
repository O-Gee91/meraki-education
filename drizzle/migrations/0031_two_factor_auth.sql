CREATE TABLE public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_backup_codes_user_idx ON public.mfa_backup_codes(user_id);
GRANT ALL ON public.mfa_backup_codes TO service_role;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mfa_email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_email_codes_user_idx ON public.mfa_email_codes(user_id);
GRANT ALL ON public.mfa_email_codes TO service_role;
ALTER TABLE public.mfa_email_codes ENABLE ROW LEVEL SECURITY;

-- Admin-only: which accounts have a verified authenticator. Never exposes secrets.
CREATE OR REPLACE FUNCTION public.staff_mfa_status()
RETURNS TABLE(user_id uuid, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT p.id, EXISTS (
    SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified'
  )
  FROM public.profiles p
  WHERE public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.staff_mfa_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_mfa_status() TO authenticated;