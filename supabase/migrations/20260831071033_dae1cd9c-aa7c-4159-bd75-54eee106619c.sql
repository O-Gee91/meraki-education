ALTER TABLE public.students ADD COLUMN IF NOT EXISTS chinese_name text;
COMMENT ON COLUMN public.students.chinese_name IS 'Optional Chinese name for the student';