# Roadmap

## Assignment & Feedback Loop (approved by Joe Doyle 2026-10-12, spec: Build_a_complete_Assignment_Feedback_Loop)
- [ ] DB migration: assignments.status (draft/published), grades.is_draft/posted_at/posted_by, grade_changes audit table + RLS (student/guardian see posted only)
- [ ] Teacher: New Assignment dialog — Save as Draft / Publish
- [ ] Teacher: Grade Submissions panel — Save Draft / Post Grade, GradeChange on every post
- [ ] Gradebook: amber draft dot on cells, History popover from grade_changes
- [ ] Gradebook: unsubmitted counts as 0 only after teacher posts grades for that assignment
- [ ] Student: /assignments hub (All / Due Soon / Missing / Graded filters) + detail view
- [ ] Student: Missing Work summary card on dashboard
- [ ] Guardian: read-only assignments view with status chips and posted score/feedback
- [ ] Delete assignment preserves grade_changes history
- [ ] Remove temporary "Open preview" button + /feedback-loop-preview route once real flow verified
- [ ] Verify end-to-end with real sessions (teacher, student, guardian)

## Deferred / open
- Email delivery for password resets (DNS for merakieducation.com — user deferred)
- Mainland China migration (Tencent Cloud) — awaiting user's chosen first step
- 2FA options presented — awaiting user's choice
- Print gradebook unverified on paginated class page
- No student-facing pages reviewed with real student session; Safari/macOS unverified
- Homework late-status penalty override recorded but not applied to scores
- 11 security findings untouched per user request
