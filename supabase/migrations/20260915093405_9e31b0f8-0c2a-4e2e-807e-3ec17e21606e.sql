ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS available_from timestamptz;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE public.assessment_submissions ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false;
ALTER TABLE public.assessment_submissions ADD COLUMN IF NOT EXISTS late_accepted boolean NOT NULL DEFAULT false;