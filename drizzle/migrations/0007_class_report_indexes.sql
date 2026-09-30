CREATE INDEX IF NOT EXISTS grades_assignment_idx ON public.grades (assignment_id);
CREATE INDEX IF NOT EXISTS attendance_class_student_idx ON public.attendance (class_id, student_id);
CREATE INDEX IF NOT EXISTS behavior_notes_student_idx ON public.behavior_notes (student_id);
CREATE INDEX IF NOT EXISTS behavior_notes_class_idx ON public.behavior_notes (class_id);
CREATE INDEX IF NOT EXISTS detentions_student_idx ON public.detentions (student_id);
CREATE INDEX IF NOT EXISTS enrollments_class_idx ON public.enrollments (class_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_assignment_idx ON public.assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS assessment_submissions_assessment_idx ON public.assessment_submissions (assessment_id);