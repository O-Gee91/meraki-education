# Roadmap

## Class snapshot wellbeing access
- [x] Respect the active admin/teacher hat and include verified co-taught classes in wellbeing feed scope
- [x] Run access regression tests — 16 wellbeing tests pass, including admin, dual-role, co-teacher and student/guardian privacy cases
- [ ] Verify live admin/co-teacher snapshot — restored educator session opens as Student Tester in the preview, so staff-only snapshot cannot be exercised

## Grade-clear email correction
- [x] Skip cleared scores at both alert boundaries; preserve notifications for zero, special marks and real posted corrections; 12 regression tests pass
- [ ] Educator end-to-end grading check — restored preview opens as Student Tester, not an educator

## Teacher cognitive-load rollout
- [x] Phase 1: quieter assignment cards, collapsed Gradebook averages and underline class tabs
- [x] Phase 2: grouped educator sidebar and contextual class/tab breadcrumbs; student navigation preserved
- [ ] Phase 2 educator visual review — available minted session reads as Student Tester; requires an educator preview session
- [x] Phase 3: clickable Pulse filters and teacher dashboard to-do feed (educator visual check pending educator session)
- [x] Phase 4: Gradebook score hover details, calm amber/slate statuses (red only for destructive), one solid button per area on class pages
- [x] Class snapshot above Pulse: attendance, missing work, behavior, wellbeing tiles that filter students (staff only; educator visual check pending)


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
- [x] Guardian multi-child: child selector on /assignments; hub shows published work and posted grades only
- [ ] Verify student/guardian RLS with a real student session (preview session is staff)

## Deferred / open
- Email delivery for password resets (DNS for merakieducation.com — user deferred)
- Mainland China migration (Tencent Cloud) — awaiting user's chosen first step
- 2FA options presented — awaiting user's choice
- Print gradebook unverified on paginated class page
- No student-facing pages reviewed with real student session; Safari/macOS unverified
- Homework late-status penalty override recorded but not applied to scores
- 11 security findings untouched per user request
- [x] Messaging: student/guardian teacher contacts, read receipts, Inbox/Sent, Reply, unread badge (educator end-to-end check pending)
- [x] Detentions: tester cleanup, no tester detentions, teachers see own classes, admins grouped by grade

## Global Student View (Joe Doyle 2026-10-28)
- [x] Header "View as student" toggle for staff, persistent banner with Exit, student navigation
- [x] Dashboard, Classes, Assignments, Well-being, Behavior, Reports scoped to the demo Student Tester; staff-only pages blocked; messages/check-ins/portfolio read-only
- [ ] Educator visual check of student view — needs an educator preview session

## Consistency & reliability pass (Joe Doyle 2026-10-30)
- [x] One shared missing-work rule (M mark, or published + past due + nothing turned in + no score; EX never) in Gradebook, Pulse/snapshot, Assignments hub, Overview
- [x] Calendar: class filter, Calendar tab on class pages, instant refresh after coursework saves/edits/deletes
- [x] Guardian Overview missing work shown per child
- [x] Student discussion points visible once graded (own only) — confirmed in code
- [x] No quest/XP/achievement wording remains
- [ ] Signed-in educator and student browser checks (wellbeing badge, Student View, calendar, missing work)

## Login accountability (Joe Doyle 2026-11-03)
- [x] Sign-ins recorded by the database on every authentication, so "Invisible session" clients cannot skip the log

## Student 2FA opt-out (Joe Doyle 2026-11-12)
- [x] Optional skip with bilingual risk warning and confirmation checkbox
- [x] Clearer code-mismatch message (old app entry / device time)

## Professional audit follow-up (Nov 13, 2026)
- [x] Class page: 10 tabs grouped into 5 sections with sub-section buttons
- [ ] Live click-through as each role (needs approved test sessions)
- [ ] Simplify Coursework controls; Needs-grading counts on gradebook columns; deleted-post admin viewer; behavior Filters popover; guardian child picker on class pages; staff dashboard focus
