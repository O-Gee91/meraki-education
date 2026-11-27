-- Durable Meraki student IDs.
-- student_number stays the public ID. New IDs are MK + 6 digits + an ISO/IEC 7812
-- Luhn check digit. Body 000042 issues MK0000422. The sample shape MK0000420 does
-- not pass that check, so it is not issued. Imported legacy values may keep
-- another shape. Existing non-empty numbers are kept and marked imported.
-- Shared numbers stay on the earliest created_at row; the others are reissued.
-- Issued IDs are not built from a name, date of birth, email, username, or SSN.
-- This migration does not replace can_view_student or can_manage_student.

CREATE SEQUENCE IF NOT EXISTS public.student_number_seq AS integer MINVALUE 1 START 1;
REVOKE ALL ON SEQUENCE public.student_number_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.retired_student_numbers (
  student_number text PRIMARY KEY,
  student_id uuid,
  retired_at timestamptz NOT NULL DEFAULT now(),
  retired_by uuid,
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.student_number_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  action text NOT NULL,
  old_number text,
  new_number text,
  old_status text,
  new_status text,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_number_audit_action_check CHECK (
    action IN ('issued', 'imported', 'duplicate_reissued', 'corrected', 'retired', 'status_changed')
  )
);

CREATE INDEX IF NOT EXISTS student_number_audit_student_idx
  ON public.student_number_audit (student_id, created_at DESC);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS student_number_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS student_number_issued_by uuid,
  ADD COLUMN IF NOT EXISTS student_number_issuer text,
  ADD COLUMN IF NOT EXISTS student_status text;

UPDATE public.students
SET student_status = 'active'
WHERE student_status IS NULL;

ALTER TABLE public.students ALTER COLUMN student_status SET DEFAULT 'active';
ALTER TABLE public.students ALTER COLUMN student_status SET NOT NULL;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_status_check;
ALTER TABLE public.students ADD CONSTRAINT students_student_status_check
  CHECK (student_status IN ('active', 'withdrawn', 'transferred_out', 'graduated', 'no_show'));

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_number_issuer_check;
ALTER TABLE public.students ADD CONSTRAINT students_student_number_issuer_check
  CHECK (student_number_issuer IS NULL OR student_number_issuer IN ('issued', 'imported', 'corrected'));

-- Keep stored IDs comparable: trim, drop whitespace, uppercase, cap at 40 characters.
UPDATE public.students
SET student_number = nullif(left(upper(regexp_replace(btrim(student_number), '\s+', '', 'g')), 40), '')
WHERE student_number IS NOT NULL;

-- Earliest row keeps a shared number. Later copies are cleared and reissued below.
WITH ranked AS (
  SELECT id, student_number,
         row_number() OVER (PARTITION BY student_number ORDER BY created_at ASC, id ASC) AS rn
  FROM public.students
  WHERE student_number IS NOT NULL
),
logged AS (
  INSERT INTO public.student_number_audit (student_id, action, old_number, reason)
  SELECT id, 'duplicate_reissued', student_number,
         'Shared student ID kept on the earliest record. A new ID is issued for this student.'
  FROM ranked
  WHERE rn > 1
  RETURNING student_id
)
UPDATE public.students AS s
SET student_number = NULL,
    student_number_issuer = NULL,
    student_number_issued_at = NULL,
    student_number_issued_by = NULL
FROM ranked AS r
WHERE s.id = r.id
  AND r.rn > 1
  AND s.id IN (SELECT student_id FROM logged);

UPDATE public.students
SET student_number_issuer = 'imported',
    student_number_issued_at = COALESCE(student_number_issued_at, created_at)
WHERE student_number IS NOT NULL
  AND student_number_issuer IS NULL;

INSERT INTO public.student_number_audit (student_id, action, new_number, reason)
SELECT s.id, 'imported', s.student_number, 'Existing student ID kept'
FROM public.students AS s
WHERE s.student_number IS NOT NULL
  AND s.student_number_issuer = 'imported'
  AND NOT EXISTS (
    SELECT 1 FROM public.student_number_audit AS a
    WHERE a.student_id = s.id AND a.action = 'imported' AND a.new_number = s.student_number
  );

CREATE UNIQUE INDEX IF NOT EXISTS students_student_number_key
  ON public.students (student_number)
  WHERE student_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS students_status_idx ON public.students (student_status);

CREATE OR REPLACE FUNCTION public.luhn_check_digit(body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i integer;
  digit integer;
  total integer := 0;
  double_digit boolean := true;
BEGIN
  IF body !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Student ID body must be digits.';
  END IF;
  FOR i IN REVERSE length(body)..1 LOOP
    digit := substr(body, i, 1)::integer;
    IF double_digit THEN
      digit := digit * 2;
      IF digit > 9 THEN
        digit := digit - 9;
      END IF;
    END IF;
    total := total + digit;
    double_digit := NOT double_digit;
  END LOOP;
  RETURN ((10 - (total % 10)) % 10)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_issued_student_number(_number text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _number ~ '^MK[0-9]{7}$'
     AND substr(_number, 9, 1) = public.luhn_check_digit(substr(_number, 3, 6));
$$;

CREATE OR REPLACE FUNCTION public.normalize_student_number(_raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := upper(regexp_replace(btrim(coalesce(_raw, '')), '\s+', '', 'g'));
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;
  IF char_length(cleaned) > 40 THEN
    RAISE EXCEPTION 'Student ID must be 40 characters or fewer.';
  END IF;
  RETURN cleaned;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_free_student_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  body integer;
  digits text;
  candidate text;
  attempts integer := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > 1000 THEN
      RAISE EXCEPTION 'Could not issue a student ID.';
    END IF;
    body := nextval('public.student_number_seq');
    IF body > 999999 THEN
      RAISE EXCEPTION 'Student ID numbers are exhausted.';
    END IF;
    digits := lpad(body::text, 6, '0');
    candidate := 'MK' || digits || public.luhn_check_digit(digits);
    IF EXISTS (SELECT 1 FROM public.students WHERE student_number = candidate) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.retired_student_numbers WHERE student_number = candidate) THEN
      CONTINUE;
    END IF;
    RETURN candidate;
  END LOOP;
END;
$$;

-- Idempotent. A student who already has a number gets that number back.
CREATE OR REPLACE FUNCTION public.assign_issued_student_number(_student_id uuid, _actor uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing text;
  candidate text;
BEGIN
  SELECT student_number INTO existing
  FROM public.students
  WHERE id = _student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;

  existing := public.normalize_student_number(existing);
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  candidate := public.next_free_student_number();
  PERFORM set_config('meraki.student_number_write', 'allow', true);

  UPDATE public.students
  SET student_number = candidate,
      student_number_issued_at = now(),
      student_number_issued_by = _actor,
      student_number_issuer = 'issued'
  WHERE id = _student_id;

  INSERT INTO public.student_number_audit (student_id, action, new_number, actor_id, reason)
  VALUES (_student_id, 'issued', candidate, _actor, 'Issued a Meraki student ID.');

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_student_number(_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.can_manage_student(_student_id)) THEN
    RAISE EXCEPTION 'Not allowed to issue a student ID.';
  END IF;
  RETURN public.assign_issued_student_number(_student_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_student_number(_student_id uuid, _new_number text, _reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_number text;
  new_number text;
  clean_reason text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can correct a student ID.';
  END IF;

  clean_reason := btrim(coalesce(_reason, ''));
  IF char_length(clean_reason) < 3 THEN
    RAISE EXCEPTION 'A reason is required to correct a student ID.';
  END IF;
  IF char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'Reason is too long.';
  END IF;

  new_number := public.normalize_student_number(_new_number);
  IF new_number IS NULL THEN
    RAISE EXCEPTION 'Enter the corrected student ID.';
  END IF;
  IF new_number ~ '^MK[0-9]{7}$' AND NOT public.is_valid_issued_student_number(new_number) THEN
    RAISE EXCEPTION 'That Meraki student ID check digit is not valid.';
  END IF;

  SELECT student_number INTO current_number
  FROM public.students
  WHERE id = _student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;

  current_number := public.normalize_student_number(current_number);
  IF current_number IS NOT DISTINCT FROM new_number THEN
    RETURN current_number;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE student_number = new_number AND id <> _student_id
  ) THEN
    RAISE EXCEPTION 'That student ID is already assigned to another student.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.retired_student_numbers WHERE student_number = new_number
  ) THEN
    RAISE EXCEPTION 'That student ID was retired and cannot be reused.';
  END IF;

  IF current_number IS NOT NULL THEN
    INSERT INTO public.retired_student_numbers (student_number, student_id, retired_by, reason)
    VALUES (current_number, _student_id, auth.uid(), clean_reason)
    ON CONFLICT (student_number) DO NOTHING;
  END IF;

  PERFORM set_config('meraki.student_number_write', 'allow', true);

  UPDATE public.students
  SET student_number = new_number,
      student_number_issuer = 'corrected',
      student_number_issued_at = now(),
      student_number_issued_by = auth.uid()
  WHERE id = _student_id;

  INSERT INTO public.student_number_audit (
    student_id, action, old_number, new_number, reason, actor_id
  ) VALUES (
    _student_id, 'corrected', current_number, new_number, clean_reason, auth.uid()
  );

  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_status(_student_id uuid, _status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous text;
BEGIN
  IF NOT (public.is_admin() OR public.can_manage_student(_student_id)) THEN
    RAISE EXCEPTION 'Not allowed to change this student''s status.';
  END IF;
  IF _status NOT IN ('active', 'withdrawn', 'transferred_out', 'graduated', 'no_show') THEN
    RAISE EXCEPTION 'Unknown student status.';
  END IF;

  SELECT student_status INTO previous
  FROM public.students
  WHERE id = _student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;
  IF previous IS NOT DISTINCT FROM _status THEN
    RETURN previous;
  END IF;

  PERFORM set_config('meraki.student_number_write', 'allow', true);

  UPDATE public.students
  SET student_status = _status
  WHERE id = _student_id;

  INSERT INTO public.student_number_audit (
    student_id, action, old_status, new_status, actor_id, reason
  ) VALUES (
    _student_id,
    'status_changed',
    previous,
    _status,
    auth.uid(),
    'School status updated. The student record and student ID stay on file.'
  );

  RETURN _status;
END;
$$;

-- School-wide existence check for import. Returns the student id only when the
-- caller may update that student, so a teacher does not learn another student's id.
CREATE OR REPLACE FUNCTION public.lookup_student_numbers(_numbers text[])
RETURNS TABLE (student_number text, in_use boolean, retired boolean, managed_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only teachers and admins can look up student IDs.';
  END IF;
  IF coalesce(array_length(_numbers, 1), 0) > 1000 THEN
    RAISE EXCEPTION 'Too many student IDs to look up at once.';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT DISTINCT public.normalize_student_number(n) AS student_number
    FROM unnest(_numbers) AS n
    WHERE public.normalize_student_number(n) IS NOT NULL
  )
  SELECT r.student_number,
         EXISTS (
           SELECT 1 FROM public.students AS s WHERE s.student_number = r.student_number
         ) AS in_use,
         EXISTS (
           SELECT 1 FROM public.retired_student_numbers AS t
           WHERE t.student_number = r.student_number
         ) AS retired,
         (
           SELECT s.id FROM public.students AS s
           WHERE s.student_number = r.student_number
             AND (public.is_admin() OR public.can_manage_student(s.id))
           LIMIT 1
         ) AS managed_id
  FROM requested AS r;
END;
$$;

CREATE OR REPLACE FUNCTION public.students_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := current_setting('meraki.student_number_write', true) = 'allow';

  IF TG_OP = 'DELETE' THEN
    IF OLD.student_number IS NOT NULL AND btrim(OLD.student_number) <> '' THEN
      INSERT INTO public.retired_student_numbers (student_number, student_id, retired_by, reason)
      VALUES (OLD.student_number, OLD.id, auth.uid(), 'Student record destroyed')
      ON CONFLICT (student_number) DO NOTHING;
      INSERT INTO public.student_number_audit (student_id, action, old_number, reason, actor_id)
      VALUES (
        OLD.id,
        'retired',
        OLD.student_number,
        'Student record destroyed. The ID cannot be reused.',
        auth.uid()
      );
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.student_number := public.normalize_student_number(NEW.student_number);
    NEW.student_status := coalesce(NEW.student_status, 'active');
    IF NEW.student_number IS NULL THEN
      NEW.student_number := public.next_free_student_number();
      NEW.student_number_issuer := 'issued';
      NEW.student_number_issued_at := coalesce(NEW.student_number_issued_at, now());
      NEW.student_number_issued_by := coalesce(NEW.student_number_issued_by, auth.uid());
      INSERT INTO public.student_number_audit (student_id, action, new_number, actor_id, reason)
      VALUES (NEW.id, 'issued', NEW.student_number, NEW.student_number_issued_by, 'Issued a Meraki student ID.');
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.retired_student_numbers AS r WHERE r.student_number = NEW.student_number
      ) THEN
        RAISE EXCEPTION 'That student ID was retired and cannot be reused.';
      END IF;
      IF NEW.student_number_issuer IS NULL THEN
        NEW.student_number_issuer := 'imported';
      END IF;
      NEW.student_number_issued_at := coalesce(NEW.student_number_issued_at, now());
      NEW.student_number_issued_by := coalesce(NEW.student_number_issued_by, auth.uid());
      INSERT INTO public.student_number_audit (student_id, action, new_number, actor_id, reason)
      VALUES (NEW.id, 'imported', NEW.student_number, NEW.student_number_issued_by, 'Student ID supplied at import.');
    END IF;
    RETURN NEW;
  END IF;

  NEW.student_number := public.normalize_student_number(NEW.student_number);

  IF NEW.student_number IS DISTINCT FROM public.normalize_student_number(OLD.student_number) THEN
    IF NOT allowed THEN
      RAISE EXCEPTION 'Student ID is locked. Only an administrator can correct it, and the old ID is retired.';
    END IF;
    IF NEW.student_number IS NULL THEN
      RAISE EXCEPTION 'A student ID cannot be cleared.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.retired_student_numbers AS r WHERE r.student_number = NEW.student_number
    ) THEN
      RAISE EXCEPTION 'That student ID was retired and cannot be reused.';
    END IF;
  END IF;

  IF NEW.student_status IS DISTINCT FROM OLD.student_status THEN
    IF NOT allowed THEN
      RAISE EXCEPTION 'Use Withdraw to change a student''s school status. The record and student ID stay on file.';
    END IF;
  END IF;

  IF NOT allowed THEN
    NEW.student_number_issuer := OLD.student_number_issuer;
    NEW.student_number_issued_at := OLD.student_number_issued_at;
    NEW.student_number_issued_by := OLD.student_number_issued_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_protect_identity ON public.students;
CREATE TRIGGER students_protect_identity
  BEFORE INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_protect_identity();

-- Start the sequence after any MK body already stored, including non-Luhn legacy
-- values that still occupy those six digits. nextval then returns the next body.
DO $$
DECLARE
  max_body integer;
BEGIN
  SELECT max(substring(n.student_number from 3 for 6)::integer) INTO max_body
  FROM (
    SELECT student_number FROM public.students
    WHERE student_number ~ '^MK[0-9]{7}$'
    UNION ALL
    SELECT student_number FROM public.retired_student_numbers
    WHERE student_number ~ '^MK[0-9]{7}$'
  ) AS n;

  IF max_body IS NULL OR max_body < 1 THEN
    PERFORM setval('public.student_number_seq', 1, false);
  ELSE
    PERFORM setval('public.student_number_seq', max_body, true);
  END IF;
END $$;

DO $$
DECLARE
  student_row record;
BEGIN
  FOR student_row IN
    SELECT id FROM public.students
    WHERE student_number IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    PERFORM public.assign_issued_student_number(student_row.id, NULL);
  END LOOP;
END $$;

UPDATE public.student_number_audit AS a
SET new_number = s.student_number
FROM public.students AS s
WHERE a.action = 'duplicate_reissued'
  AND a.student_id = s.id
  AND a.new_number IS NULL;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_number_pair_check;
ALTER TABLE public.students ADD CONSTRAINT students_student_number_pair_check
  CHECK (
    (student_number IS NULL AND student_number_issuer IS NULL)
    OR (student_number IS NOT NULL AND student_number_issuer IS NOT NULL)
  );

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_number_length_check;
ALTER TABLE public.students ADD CONSTRAINT students_student_number_length_check
  CHECK (student_number IS NULL OR char_length(student_number) <= 40);

-- Hard delete is data destruction. Teachers withdraw instead. This tightens the
-- previous can_manage_student delete policy; it does not grant any new read.
DROP POLICY IF EXISTS "students delete staff" ON public.students;
DROP POLICY IF EXISTS "students delete admin" ON public.students;
CREATE POLICY "students delete admin" ON public.students
  FOR DELETE TO authenticated
  USING (public.is_admin());

ALTER TABLE public.retired_student_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_number_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read retired student numbers" ON public.retired_student_numbers;
CREATE POLICY "admins read retired student numbers"
  ON public.retired_student_numbers FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "staff read student number audit" ON public.student_number_audit;
CREATE POLICY "staff read student number audit"
  ON public.student_number_audit FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      student_id IS NOT NULL
      AND public.is_staff()
      AND public.can_manage_student(student_id)
    )
  );

REVOKE ALL ON public.retired_student_numbers FROM PUBLIC, anon;
REVOKE ALL ON public.student_number_audit FROM PUBLIC, anon;
GRANT SELECT ON public.retired_student_numbers TO authenticated;
GRANT SELECT ON public.student_number_audit TO authenticated;
GRANT ALL ON public.retired_student_numbers TO service_role;
GRANT ALL ON public.student_number_audit TO service_role;

REVOKE ALL ON FUNCTION public.luhn_check_digit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_valid_issued_student_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_student_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_free_student_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_issued_student_number(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.students_protect_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_student_number(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_student_number(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_student_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lookup_student_numbers(text[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_student_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_student_number(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_student_numbers(text[]) TO authenticated;

DO $$
BEGIN
  IF public.luhn_check_digit('000042') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'Luhn self-check failed for body 000042';
  END IF;
  IF NOT public.is_valid_issued_student_number('MK0000422') THEN
    RAISE EXCEPTION 'MK0000422 must be a valid issued student ID';
  END IF;
  IF public.is_valid_issued_student_number('MK0000420') THEN
    RAISE EXCEPTION 'MK0000420 is not an ISO Luhn student ID';
  END IF;
END $$;
