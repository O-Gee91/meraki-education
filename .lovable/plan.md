# Consistency and reliability pass

## Short audit (what already exists vs. real gaps)

| Item | Status today | Gap |
|---|---|---|
| Due dates on calendar | Assignments, assessments, discussions show on the Overview calendar, refreshed about every minute | No class filter; no calendar on class pages; up to 1 min delay; deleted/closed items rely on refresh |
| Discussion boards | Edit prompt, bold/italic/large text, grade-level or selected-class sharing, per-post and per-reply scoring, open/due times, grading category | Only needs a check pass; student view of points to confirm |
| Wellbeing badge | Built for educators; clears on visit; hidden from students | Not checked in a signed-in educator account |
| Global Student View | Header toggle, banner with Exit, scoped to the teacher's own classes | Not checked in a signed-in educator account |
| Guardian child picker | On Assignments, posted grades only | Other guardian pages (Overview, Reports) still use first child |
| Class snapshot / Pulse | Uses the active staff role for wellbeing | Missing-work count uses a different rule than Gradebook |
| Missing work rule | Gradebook counts only "M" marks; Assignments/Overview count past-due work with no submission | **Confirmed mismatch**: the same student can show different counts in different places |
| Status colors | Amber for drafts/attention, red for destructive | Some empty, loading and error messages are still uneven |
| Gamification | Quest/hero features and the saved data are removed | A final word search for leftover XP/badge/quest wording |

## Phase 1 — One "Missing work" rule everywhere (highest impact)
- One shared rule: work is **missing** when it is published, past due, has no submission and no posted score, **or** a teacher marked it "M". Excused (EX) is never missing.
- Use it in: Gradebook Missing column, class snapshot tile, Pulse, student Assignments hub (Missing tab), Overview Missing card, teacher to-do.
- Grade averages stay the same; this changes only which items are counted and listed as missing.

## Phase 2 — Calendar completeness
- Add an "All classes / one class" filter to the calendar.
- Show the calendar on each class page, filtered to that class.
- Refresh the calendar right after a teacher saves, edits or deletes an item. Other open screens still refresh within a minute.
- Deleted, unpublished or draft items disappear; closed discussions show as closed.

## Phase 3 — Guardian and student consistency
- Use the guardian child picker on Overview and Reports, not only Assignments. Guardians see posted grades only.
- Students see each discussion's points (per post and total) once a teacher has graded it, and never another student's points.
- Use the same "Due soon" window (next 7 days) on Overview and Assignments.

## Phase 4 — Polish and checks
- Use the same calm wording and style for empty, loading and error messages on Overview, Assignments, Calendar, Wellbeing and the class tabs.
- Do a last search for leftover quest, XP, badge or reward wording and remove it.
- Run browser checks with an educator account (wellbeing badge, Student View, calendar) and a student account (calendar, missing work, discussion points). Update the task list with the results.

## What stays the same
Grade calculations, weighting, security rules, attendance, gradebook entry, posting and release of grades, wellbeing privacy, and the existing visual style. Security rules are not planned to change. If a change becomes necessary, I'll explain why first.

## Technical details
- New `src/lib/missing-work.ts` (`isMissing(assignment, submission, grade, today)`) with tests; used in `classes.$classId.tsx` (gradebook Missing column, print), `class/PulseDashboard.tsx`, `routes/_authenticated/assignments.tsx` (line ~167), `dashboard.tsx`, `TeacherTodo.tsx`.
- Calendar: `SchoolCalendar.tsx` gains `classId` prop + filter; `useCalendarCoursework.ts` accepts class filter; coursework save/delete paths call `queryClient.invalidateQueries(["calendar-coursework"])`; class page mounts calendar tab section.
- Guardian picker: reuse the existing child selector hook in `dashboard.tsx` and `reports.tsx`.
- Discussion student view: verify `DiscussionBoard.tsx` reads own rows from `discussion_post_scores` (existing RLS).
- Tests: missing-work rule cases (M mark, EX, submitted, posted zero, draft assignment), due-soon window.
- Update `roadmap.md` and `AGENTS.md` (shared missing-work rule).
