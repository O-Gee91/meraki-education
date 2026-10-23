# Roadmap

## Teacher cognitive-load rollout
- [x] Phase 1: quieter assignment cards, collapsed Gradebook averages and underline class tabs
- [x] Phase 2: grouped educator sidebar and contextual class/tab breadcrumbs; student navigation preserved
- [ ] Phase 2 educator visual review — available minted session reads as Student Tester; requires an educator preview session
- [ ] Phase 3: clickable Pulse filters and teacher dashboard to-do feed — awaiting request


## Assignment & Feedback Loop (approved by Joe Doyle 2026-10-12, spec: Build_a_complete_Assignment_Feedback_Loop)
- [x] DB migration: assignments.status (draft/published), grades.is_draft/posted_at/posted_by, grade_changes audit table + RLS (student/guardian see posted only)
- [x] Teacher: New Assignment dialog — Save as Draft / Publish
- [x] Teacher: Grade Submissions panel — Save Draft / Post Grade, GradeChange on every post
- [x] Gradebook: amber draft dot on cells, History popover from grade_changes
- [x] Gradebook: unsubmitted counts as 0 only after teacher posts grades for that assignment
- [x] Student: /assignments hub (All / Due Soon / Missing / Graded filters) + detail view
- [x] Student: Missing Work summary card on dashboard
- [x] Guardian: read-only assignments view with status chips and posted score/feedback
- [x] Delete assignment preserves grade_changes history (ON DELETE SET NULL + title snapshot)
- [x] Remove temporary "Open preview" button + /feedback-loop-preview route once real flow verified
- [x] Verify end-to-end: draft→publish, draft grade→post, audit rows, build clean (2026-10-12)
- [ ] Guardian multi-child: /assignments currently uses first linked child — add child selector
- [ ] Verify student/guardian RLS with a real student session (preview session is staff)

## Deferred / open
- Email delivery for password resets (DNS for merakieducation.com — user deferred)
- Mainland China migration (Tencent Cloud) — awaiting user's chosen first step
- 2FA options presented — awaiting user's choice
- Print gradebook unverified on paginated class page
- No student-facing pages reviewed with real student session; Safari/macOS unverified
- Homework late-status penalty override recorded but not applied to scores
- 11 security findings untouched per user request
