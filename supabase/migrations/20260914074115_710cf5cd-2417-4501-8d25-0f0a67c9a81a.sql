CREATE TABLE IF NOT EXISTS public.integrity_strike_reversals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  behavior_note_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  original_class_id uuid,
  original_date date NOT NULL,
  original_kind text NOT NULL,
  original_severity integer NOT NULL,
  original_notes text NOT NULL,
  original_recorded_by uuid,
  original_created_at timestamptz NOT NULL,
  reversal_reason text NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integrity_strike_reversals TO authenticated;
GRANT ALL ON public.integrity_strike_reversals TO service_role;
ALTER TABLE public.integrity_strike_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view integrity strike reversals" ON public.integrity_strike_reversals;
CREATE POLICY "Staff can view integrity strike reversals"
  ON public.integrity_strike_reversals FOR SELECT TO authenticated
  USING (public.is_staff());

-- Preserve the original detection logs for audit, then rescind the strikes.
INSERT INTO public.integrity_strike_reversals (
  behavior_note_id, student_id, original_class_id, original_date, original_kind,
  original_severity, original_notes, original_recorded_by, original_created_at, reversal_reason
)
SELECT bn.id, bn.student_id, bn.class_id, bn.date, bn.kind, bn.severity, bn.notes,
       bn.recorded_by, bn.created_at,
       'False positive — browser autofill on /settings misidentified as scripted input.'
FROM public.behavior_notes bn
WHERE bn.kind = 'strike'
  AND bn.notes LIKE 'Academic integrity: scripted (non-human) clicks or keystrokes detected on /settings — 3 untrusted events.%'
  AND NOT EXISTS (
    SELECT 1 FROM public.integrity_strike_reversals r WHERE r.behavior_note_id = bn.id
  );

DELETE FROM public.behavior_notes bn
WHERE bn.kind = 'strike'
  AND bn.notes LIKE 'Academic integrity: scripted (non-human) clicks or keystrokes detected on /settings — 3 untrusted events.%';