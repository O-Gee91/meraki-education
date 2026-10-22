CREATE OR REPLACE FUNCTION public.handle_behavior_strike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
  sender uuid;
  s record;
  msg text;
BEGIN
  IF NEW.kind <> 'strike' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO total FROM public.behavior_notes
   WHERE student_id = NEW.student_id AND kind = 'strike';

  IF total % 3 <> 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.detentions (student_id, class_id, strike_count, reason)
  VALUES (NEW.student_id, NEW.class_id, total, 'Reached ' || total || ' behavior strikes');

  SELECT * INTO s FROM public.students WHERE id = NEW.student_id;
  sender := COALESCE(NEW.recorded_by, auth.uid());
  msg := s.first_name || ' ' || s.last_name || ' has reached ' || total ||
         ' behavior strikes. A detention has been scheduled for the next school day. Please review the behavior log for details.';

  IF sender IS NOT NULL THEN
    IF s.user_id IS NOT NULL THEN
      INSERT INTO public.messages (sender_id, recipient_id, subject, body)
      VALUES (sender, s.user_id, 'Detention scheduled — 3 behavior strikes', msg);
    END IF;
    IF s.guardian_user_id IS NOT NULL THEN
      INSERT INTO public.messages (sender_id, recipient_id, subject, body)
      VALUES (sender, s.guardian_user_id, 'Detention scheduled — 3 behavior strikes', msg);
    END IF;
    -- Staff recipients: the student's own class teachers, plus admins who
    -- carry no class roster (dedicated school leadership).
    INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    SELECT sender, r.uid, 'Detention scheduled — 3 behavior strikes', msg
    FROM (
      SELECT c.teacher_id AS uid
        FROM public.enrollments e
        JOIN public.classes c ON c.id = e.class_id
       WHERE e.student_id = NEW.student_id AND c.teacher_id IS NOT NULL
      UNION
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role = 'admin'
         AND NOT EXISTS (SELECT 1 FROM public.classes c2 WHERE c2.teacher_id = ur.user_id)
    ) r
    WHERE r.uid <> sender
      AND r.uid IS DISTINCT FROM s.user_id
      AND r.uid IS DISTINCT FROM s.guardian_user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_behavior_strike() FROM anon, authenticated, PUBLIC;