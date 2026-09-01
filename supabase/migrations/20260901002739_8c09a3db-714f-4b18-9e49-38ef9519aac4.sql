CREATE TABLE public.hero_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  hero_class text NOT NULL CHECK (hero_class IN ('barbarian','rogue','druid','sorceress','necromancer','paladin')),
  quest_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_profiles TO authenticated;
GRANT ALL ON public.hero_profiles TO service_role;

ALTER TABLE public.hero_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own hero profile"
  ON public.hero_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can view hero profiles"
  ON public.hero_profiles FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE TRIGGER touch_hero_profiles
  BEFORE UPDATE ON public.hero_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();