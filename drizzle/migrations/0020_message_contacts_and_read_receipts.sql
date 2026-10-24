ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read status can be changed';
  END IF;
  IF NEW.read AND NOT OLD.read THEN NEW.read_at := now(); END IF;
  IF NOT NEW.read THEN NEW.read_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_message_update ON public.messages;
CREATE TRIGGER guard_message_update BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

-- People a student/guardian may message: teachers and co-teachers of their classes, plus admins.
CREATE OR REPLACE FUNCTION public.message_contacts()
RETURNS TABLE(id uuid, full_name text, label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT s.id FROM students s WHERE s.user_id = auth.uid() OR s.guardian_user_id = auth.uid()
  ), cls AS (
    SELECT DISTINCT c.id, c.name, c.teacher_id FROM classes c
    JOIN enrollments e ON e.class_id = c.id WHERE e.student_id IN (SELECT id FROM mine)
  ), people AS (
    SELECT cls.teacher_id AS uid, cls.name AS what FROM cls WHERE cls.teacher_id IS NOT NULL
    UNION ALL
    SELECT ct.teacher_id, cls.name FROM class_co_teachers ct JOIN cls ON cls.id = ct.class_id
    UNION ALL
    SELECT ur.user_id, 'School administration' FROM user_roles ur WHERE ur.role = 'admin'
  )
  SELECT p.id, p.full_name, string_agg(DISTINCT people.what, ', ') AS label
  FROM people JOIN profiles p ON p.id = people.uid
  WHERE p.id <> auth.uid()
  GROUP BY p.id, p.full_name
  ORDER BY p.full_name;
$$;

-- Names of everyone the caller has exchanged messages with.
CREATE OR REPLACE FUNCTION public.message_participant_names()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name FROM profiles p
  WHERE p.id IN (
    SELECT sender_id FROM messages WHERE recipient_id = auth.uid()
    UNION SELECT recipient_id FROM messages WHERE sender_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.message_contacts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.message_participant_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_participant_names() TO authenticated;