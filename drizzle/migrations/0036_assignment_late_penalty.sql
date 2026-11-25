ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS late_penalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_penalty_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS late_penalty_per_day numeric,
  ADD COLUMN IF NOT EXISTS late_penalty_zero_after_days integer;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_late_penalty_mode_check CHECK (late_penalty_mode IN ('percent','points'));
ALTER TABLE public.assignments ADD CONSTRAINT assignments_late_penalty_values_check CHECK ((late_penalty_per_day IS NULL OR late_penalty_per_day >= 0) AND (late_penalty_zero_after_days IS NULL OR late_penalty_zero_after_days >= 1));