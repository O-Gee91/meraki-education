-- Allow multiple grade-level teachers to respond to the same check-in,
-- one editable response per responder.
ALTER TABLE public.checkin_staff_notes
  DROP CONSTRAINT IF EXISTS checkin_staff_notes_checkin_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS checkin_staff_notes_checkin_responder_key
  ON public.checkin_staff_notes (checkin_id, created_by);

CREATE INDEX IF NOT EXISTS checkin_staff_notes_checkin_idx
  ON public.checkin_staff_notes (checkin_id);

-- A responder may only edit or remove their own response; admins may remove any.
DROP POLICY IF EXISTS "checkin staff notes update" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes update" ON public.checkin_staff_notes
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (public.has_role(auth.uid(), 'teacher') AND public.teaches_grade(s.grade_level))
      )
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (public.has_role(auth.uid(), 'teacher') AND public.teaches_grade(s.grade_level))
      )
  )
);

DROP POLICY IF EXISTS "checkin staff notes delete" ON public.checkin_staff_notes;
CREATE POLICY "checkin staff notes delete" ON public.checkin_staff_notes
FOR DELETE TO authenticated
USING (
  (created_by = auth.uid() OR public.is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.checkins c
    JOIN public.students s ON s.id = c.student_id
    WHERE c.id = checkin_id
      AND (
        public.is_admin()
        OR (public.has_role(auth.uid(), 'teacher') AND public.teaches_grade(s.grade_level))
      )
  )
);
