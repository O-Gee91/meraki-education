# Roadmap

## Cross-role pilot walkthrough (Nov 25, 2026)
- [ ] Teacher: dashboard, class coursework/gradebook, discussions, messages, reports and settings
- [ ] Student: dashboard, assignments, class discussions, wellbeing, calendar and two-step verification gate
- [ ] Guardian: child overview, assignments, calendar, messages and read-only boundaries
- [ ] Admin: people, classes, reports, moderation and school-wide oversight
- [ ] Check laptop/tablet layouts, console/network failures and role-based access; fix confirmed issues
- [ ] Run regression tests and record verified flows plus any account/email/device limitations

## School pilot verification pass (Nov 25, 2026)
- [x] Initial findings: 111 tests pass; public pages and live HTTPS/header checks pass
- [x] P1: Hide nonfunctional late-penalty entry while preserving existing overrides and scores
- [x] P1: Make Needs Attention include both ungraded work and draft grades awaiting posting
- [x] P1: Align calendar completion with shared coursework/discussion criteria and load complete query results
- [x] P1: Restrict original discussion audit content to administrators — applied database policy and confirmed is_admin() restriction
- [x] P1: Validate password-reset redirect origins before generating recovery links
- [ ] Untrack .env — platform refuses because published builds require tracked public connection configuration; no private credentials found
- [ ] Cross-role laptop/tablet walkthrough — restored owner session stops at real passkey verification; no bypass permitted
- [ ] P2: Confirm legal operator/contact; real-device passkey and delivered recovery email checks
- [x] Produce final findings report (school-pilot-verification.md); 136 tests pass, preview build OK; public recovery/navigation verified

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
- [x] Nonworking homework penalty override hidden; existing score/late-status metadata preserved (Nov 25)
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
- [x] Needs-grading counts on gradebook columns; deleted-post viewer (staff only); behavior Filters popover; guardian child picker on class pages
- [ ] Simplify Coursework controls; staff dashboard focus
- [ ] Guardian child picker live check — no parent account chosen to test with

## Passkeys as second step (Joe Doyle 2026-11-16)
- [x] Cross-checked against MDN Web Authentication API (dynamic site ID, base64url, feature detection, preferred verification, no attestation, single-use 5-min challenges)
- [x] Add/remove passkeys in Settings and on the student setup screen; fingerprint/face button at sign-in with code fallbacks
- [x] Bilingual Passkey tab in the setup guide
- [x] Tested end to end with a simulated fingerprint device on a temporary account (deleted after)
- [ ] Real-device check on an iPhone/Mac/Windows laptop on the published site
- [ ] Student PDF guide not yet updated with the passkey section

## Report comments & feedback suggestions (Joe Doyle 2026-11-17)
- [x] Printed student report includes assignment comments (toggle, on by default; mark codes hidden)
- [x] "Suggest comment" drafts editable feedback from score, rubric results and teacher notes (rubric + proofread boxes)
- [ ] Educator check of both in a signed-in session
- Dropped/moved students: past class records kept in dropped_enrollments (trigger on enrollment delete); missing work ignores assignments created before joining.

## Project monitoring transfer fixes (Joe Doyle 2026-11-19)
- [x] Count carried-over Transfer grades in fully weighted classes without changing teacher category weights
- [x] Exclude work created or due after a student's departure from dropped-student missing counts
- [x] Regression coverage: 19 transfer-grade and missing-work checks pass
- [x] Full-app sweep: Pulse, grading roster, discussions, individual reports, dashboards and hubs use the enrollment window
- [x] Future report cards and print templates use computeAverage with each class's grading setup; saved report-card records unchanged
- [x] Earlier-work averages use the previous class's own grading setup
- [ ] Signed-in teacher walkthrough of the sweep — minted educator session redirected to /auth

## Data loading pass 1 (done)
- [x] Shared list helper (fetchAll / fetchPage / chunk) — gradebook, hub, Pulse, reports, print templates, discussion completion and threads read past 1000 rows
- [x] Shared coursework status/due-window filters (coursework-filters.ts)
- [x] Discussion posts soft delete with "Post removed" placeholder and audit copy
- [ ] Later: paged loading for messages, behavior log, calendar, community feed; "Show more" UI; versioned partner endpoints (none exist)

## Data loading pass 2 (Joe Doyle 2026-11-23)
- [x] Printed reports: full attendance, behavior and detention counts (no 1000-row cutoff)
- [x] Pulse attendance and admin detention list load every row
- [ ] Messages (latest 150), behavior log (latest 500) and wellbeing feed (latest 1000) remain intentional recent-only views; "Show more" controls not added

## Polish pass (Nov 24)
- [x] Upcoming tab restored; categories collapsible
- [x] Single close control on grading windows
- [x] Discussion status labels separate submission vs grading
- [x] Admin discussion moderation page
- [ ] Signed-in tablet-width layout check (blocked: test sign-in redirects)
