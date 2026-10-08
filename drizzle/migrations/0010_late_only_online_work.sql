CREATE OR REPLACE FUNCTION public.submission_is_late(_assignment_id uuid, _submitted_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT _submitted_at > (((a.due_date + 1)::timestamp) AT TIME ZONE COALESCE(c.timezone, 'Asia/Shanghai'))
    FROM public.assignments a JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = _assignment_id AND a.due_date IS NOT NULL AND a.submission_mode = 'online'
      AND a.created_at::date <= a.due_date
  ), false);
$$;

UPDATE public.assignment_submissions s
   SET is_late = public.submission_is_late(s.assignment_id, s.submitted_at)
 WHERE s.late_override_at IS NULL;