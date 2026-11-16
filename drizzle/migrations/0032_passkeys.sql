CREATE TABLE public.passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_name text NOT NULL DEFAULT 'This device',
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX ON public.passkey_credentials(user_id);
GRANT SELECT, DELETE ON public.passkey_credentials TO authenticated;
GRANT ALL ON public.passkey_credentials TO service_role;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own passkeys readable" ON public.passkey_credentials FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own passkeys removable" ON public.passkey_credentials FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge text NOT NULL,
  kind text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.passkey_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.passkey_sessions TO service_role;
ALTER TABLE public.passkey_sessions ENABLE ROW LEVEL SECURITY;