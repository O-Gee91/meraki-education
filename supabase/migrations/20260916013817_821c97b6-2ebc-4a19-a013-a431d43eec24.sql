ALTER TABLE public.behavior_notes
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scored_zero boolean NOT NULL DEFAULT false;