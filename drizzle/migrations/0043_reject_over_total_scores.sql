-- Reject scores that are higher than the assignment, question, or discussion
-- total. Transfer columns are the exception: they store the previous class
-- percentage, which extra credit can lift above 100. Extra credit assignments
-- stay capped at their own total — that total is the bonus.
-- Triggers run for browser writes and service-role server functions.

CREATE OR REPLACE FUNCTION public.format_score_limit(n numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN n IS NULL THEN ''
    -- Strip only fractional trailing zeros. "20" must stay "20", not "2".
    WHEN n::text LIKE '%.%' THEN regexp_replace(regexp_replace(n::text, '0+$', ''), '\.$', '')
    ELSE n::text
  END
$$;

CREATE OR REPLACE FUNCTION public.reject_over_total_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  possible numeric;
  category text;
BEGIN
  IF NEW.points_earned IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.points_earned < 0 THEN
    RAISE EXCEPTION 'Score must be 0 or more.';
  END IF;

  SELECT a.points_possible, a.category
    INTO possible, category
  FROM public.assignments a
  WHERE a.id = NEW.assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found.';
  END IF;

  -- Transfer columns store the previous class percentage. Extra credit can
  -- lift that percentage above this column's points.
  IF lower(btrim(coalesce(category, ''))) = 'transfer' THEN
    IF NEW.points_earned > 10000 THEN
      RAISE EXCEPTION 'Score cannot be higher than 10000.';
    END IF;
    RETURN NEW;
  END IF;

  IF possible IS NOT NULL AND NEW.points_earned > possible THEN
    RAISE EXCEPTION 'Score cannot be higher than %, the total for this assignment.', public.format_score_limit(possible);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_reject_over_total ON public.grades;
CREATE TRIGGER grades_reject_over_total
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.reject_over_total_grade();

CREATE OR REPLACE FUNCTION public.reject_shrinking_assignment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  highest numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.points_possible IS NULL OR NEW.points_possible >= OLD.points_possible THEN
    RETURN NEW;
  END IF;
  IF lower(btrim(coalesce(NEW.category, ''))) = 'transfer' THEN
    RETURN NEW;
  END IF;

  SELECT max(g.points_earned) INTO highest
  FROM public.grades g
  WHERE g.assignment_id = NEW.id
    AND g.points_earned IS NOT NULL
    AND g.points_earned > NEW.points_possible;

  IF highest IS NOT NULL THEN
    RAISE EXCEPTION 'Points possible cannot be lower than %, a score already saved on this assignment.', public.format_score_limit(highest);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignments_reject_shrinking_total ON public.assignments;
CREATE TRIGGER assignments_reject_shrinking_total
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_shrinking_assignment_total();

CREATE OR REPLACE FUNCTION public.reject_over_total_discussion_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  possible numeric;
  response_pts numeric;
  reply_pts numeric;
  parent uuid;
  cap numeric;
  total numeric;
BEGIN
  IF NEW.points IS NULL OR NEW.points < 0 THEN
    RAISE EXCEPTION 'Score must be 0 or more.';
  END IF;

  SELECT d.points_possible, d.response_points, d.reply_points, p.parent_id
    INTO possible, response_pts, reply_pts, parent
  FROM public.discussion_posts p
  JOIN public.discussions d ON d.id = NEW.discussion_id
  WHERE p.id = NEW.post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discussion post not found.';
  END IF;

  IF coalesce(response_pts, 0) = 0 AND coalesce(reply_pts, 0) = 0 THEN
    cap := CASE WHEN parent IS NULL THEN coalesce(possible, 0) ELSE 0 END;
  ELSE
    cap := CASE WHEN parent IS NULL THEN coalesce(response_pts, 0) ELSE coalesce(reply_pts, 0) END;
  END IF;

  IF NEW.points > cap THEN
    IF parent IS NULL THEN
      RAISE EXCEPTION 'Score cannot be higher than %, the total for this response.', public.format_score_limit(cap);
    ELSE
      RAISE EXCEPTION 'Score cannot be higher than %, the total for this reply.', public.format_score_limit(cap);
    END IF;
  END IF;

  SELECT coalesce(sum(s.points), 0) INTO total
  FROM public.discussion_post_scores s
  WHERE s.discussion_id = NEW.discussion_id
    AND s.author_id = NEW.author_id
    AND s.post_id <> NEW.post_id;

  total := total + NEW.points;
  IF possible IS NOT NULL AND total > possible THEN
    RAISE EXCEPTION 'These scores add up to more than %, the total for this discussion.', public.format_score_limit(possible);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discussion_scores_reject_over_total ON public.discussion_post_scores;
CREATE TRIGGER discussion_scores_reject_over_total
  BEFORE INSERT OR UPDATE ON public.discussion_post_scores
  FOR EACH ROW EXECUTE FUNCTION public.reject_over_total_discussion_score();

CREATE OR REPLACE FUNCTION public.reject_over_total_answer_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  question_points numeric;
BEGIN
  IF NEW.points_awarded IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.points_awarded < 0 THEN
    RAISE EXCEPTION 'Score must be 0 or more.';
  END IF;

  SELECT q.points INTO question_points
  FROM public.assessment_questions q
  WHERE q.id = NEW.question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found.';
  END IF;

  IF NEW.points_awarded > question_points THEN
    RAISE EXCEPTION 'Score cannot be higher than %, the total for this question.', public.format_score_limit(question_points);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_answers_reject_over_total ON public.assessment_answers;
CREATE TRIGGER assessment_answers_reject_over_total
  BEFORE INSERT OR UPDATE ON public.assessment_answers
  FOR EACH ROW EXECUTE FUNCTION public.reject_over_total_answer_score();

CREATE OR REPLACE FUNCTION public.reject_over_total_submission_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earned numeric;
BEGIN
  IF NEW.total_points IS NULL THEN
    RETURN NEW;
  END IF;
  earned := coalesce(NEW.auto_score, 0) + coalesce(NEW.manual_score, 0);
  IF earned > NEW.total_points THEN
    RAISE EXCEPTION 'Score cannot be higher than %, the total for this assessment.', public.format_score_limit(NEW.total_points);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessment_submissions_reject_over_total ON public.assessment_submissions;
CREATE TRIGGER assessment_submissions_reject_over_total
  BEFORE INSERT OR UPDATE ON public.assessment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.reject_over_total_submission_score();
