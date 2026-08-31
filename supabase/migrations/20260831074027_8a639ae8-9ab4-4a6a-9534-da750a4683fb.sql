
-- cascade student-linked records
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_student_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_student_id_fkey;
ALTER TABLE public.grades ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.behavior_notes DROP CONSTRAINT IF EXISTS behavior_notes_student_id_fkey;
ALTER TABLE public.behavior_notes ADD CONSTRAINT behavior_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.detentions DROP CONSTRAINT IF EXISTS detentions_student_id_fkey;
ALTER TABLE public.detentions ADD CONSTRAINT detentions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS checkins_student_id_fkey;
ALTER TABLE public.checkins ADD CONSTRAINT checkins_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.seats DROP CONSTRAINT IF EXISTS seats_student_id_fkey;
ALTER TABLE public.seats ADD CONSTRAINT seats_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.portfolio_items DROP CONSTRAINT IF EXISTS portfolio_items_student_id_fkey;
ALTER TABLE public.portfolio_items ADD CONSTRAINT portfolio_items_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.report_cards DROP CONSTRAINT IF EXISTS report_cards_student_id_fkey;
ALTER TABLE public.report_cards ADD CONSTRAINT report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_student_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_student_id_fkey;
ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.assessment_submissions DROP CONSTRAINT IF EXISTS assessment_submissions_student_id_fkey;
ALTER TABLE public.assessment_submissions ADD CONSTRAINT assessment_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.file_uploads DROP CONSTRAINT IF EXISTS file_uploads_student_id_fkey;
ALTER TABLE public.file_uploads ADD CONSTRAINT file_uploads_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.assessment_answers DROP CONSTRAINT IF EXISTS assessment_answers_submission_id_fkey;
ALTER TABLE public.assessment_answers ADD CONSTRAINT assessment_answers_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.assessment_submissions(id) ON DELETE CASCADE;

ALTER TABLE public.submission_annotations DROP CONSTRAINT IF EXISTS submission_annotations_submission_id_fkey;
ALTER TABLE public.submission_annotations ADD CONSTRAINT submission_annotations_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.assignment_submissions(id) ON DELETE CASCADE;

ALTER TABLE public.checkin_staff_notes DROP CONSTRAINT IF EXISTS checkin_staff_notes_checkin_id_fkey;
ALTER TABLE public.checkin_staff_notes ADD CONSTRAINT checkin_staff_notes_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES public.checkins(id) ON DELETE CASCADE;

-- allow managing teachers (not only admins) to delete students
DROP POLICY IF EXISTS "students delete admin" ON public.students;
CREATE POLICY "students delete staff" ON public.students
FOR DELETE TO authenticated
USING (public.can_manage_student(id));
