ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;
UPDATE public.students SET is_tester = true WHERE first_name = 'Student' AND last_name = 'Tester';