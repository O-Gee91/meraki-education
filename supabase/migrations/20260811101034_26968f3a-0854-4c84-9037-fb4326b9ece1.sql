CREATE TABLE public.detentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'Three behavior strikes',
  strike_count integer NOT NULL DEFAULT 3,
  scheduled_date date NOT NULL DEFAULT (now()::date + 1),
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.detentions TO authenticated;
GRANT ALL ON public.detentions TO service_role;

ALTER TABLE public.detentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage detentions" ON public.detentions
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "Families view their detentions" ON public.detentions
  FOR SELECT TO authenticated USING (public.can_view_student(student_id));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER update_detentions_updated_at
  BEFORE UPDATE ON public.detentions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
    INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    SELECT sender, ur.user_id, 'Detention scheduled — 3 behavior strikes', msg
    FROM public.user_roles ur
    WHERE ur.role = 'admin' AND ur.user_id <> sender;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_behavior_strike() FROM anon, authenticated, PUBLIC;

CREATE TRIGGER behavior_strike_trg
  AFTER INSERT ON public.behavior_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_behavior_strike();