INSERT INTO public.integrity_strike_reversals (
  behavior_note_id, student_id, original_class_id, original_date, original_kind,
  original_severity, original_notes, original_recorded_by, original_created_at, reversal_reason
)
SELECT bn.id, bn.student_id, bn.class_id, bn.date, bn.kind, bn.severity, bn.notes,
       bn.recorded_by, bn.created_at,
       'False positive — mobile browser/password-manager autofill and keyboard bridge activity misidentified as scripting (Daniel Ma, Bryce Yu).'
FROM public.behavior_notes bn
WHERE bn.id IN (
  '284c6acf-40a2-4916-88d7-198991f60a7e',
  '93755e78-dc9b-47d6-85aa-3c6fd23c0770'
)
AND NOT EXISTS (
  SELECT 1 FROM public.integrity_strike_reversals r WHERE r.behavior_note_id = bn.id
);

DELETE FROM public.behavior_notes
WHERE id IN (
  '284c6acf-40a2-4916-88d7-198991f60a7e',
  '93755e78-dc9b-47d6-85aa-3c6fd23c0770'
);