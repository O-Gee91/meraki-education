-- Well-being responses fail with "permission denied for function has_role" because
-- the policies call it as the signed-in role, which lacks EXECUTE.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Calendar reads must be limited to signed-in users, not the anon role.
DROP POLICY IF EXISTS "Signed-in users can view calendar events" ON public.calendar_events;
CREATE POLICY "Signed-in users can view calendar events" ON public.calendar_events
FOR SELECT TO authenticated
USING (
  public.can_see_audiences(audiences)
  AND public.can_view_grade(grade_level)
  AND (
    (class_id IS NULL AND (class_ids IS NULL OR cardinality(class_ids) = 0))
    OR public.can_view_class(class_id)
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(class_ids, '{}'::uuid[])) cid
      WHERE public.can_view_class(cid)
    )
  )
);
