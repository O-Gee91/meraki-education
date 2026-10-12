CREATE OR REPLACE FUNCTION public.log_grade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;
  -- Skip no-op updates: already posted and neither score nor feedback changed.
  IF TG_OP = 'UPDATE'
     AND NOT OLD.is_draft
     AND OLD.points_earned IS NOT DISTINCT FROM NEW.points_earned
     AND OLD.comment IS NOT DISTINCT FROM NEW.comment THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.grade_changes (
    assignment_id, assignment_title, student_id, changed_by,
    old_score, new_score, old_feedback, new_feedback
  )
  SELECT
    NEW.assignment_id,
    a.title,
    NEW.student_id,
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.points_earned END,
    NEW.points_earned,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.comment END,
    NEW.comment
  FROM public.assignments a
  WHERE a.id = NEW.assignment_id;
  RETURN NEW;
END;
$$;