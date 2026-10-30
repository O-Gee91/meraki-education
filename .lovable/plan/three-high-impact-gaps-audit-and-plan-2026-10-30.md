# Three high-impact gaps: audit and plan

## Current-state audit

### 1. Due dates on the calendar: mostly built
Already working (in code):
- Assignments, assessments and discussions with due dates show on the School calendar automatically. They come straight from the coursework, so there is no separate calendar entry that could drift out of sync.
- Edits and deletions show up right away, because coursework saves refresh the calendar. Other open screens refresh about once a minute.
- Students and parents see only published work from their own classes. Teachers see their class-level items.
- There is a class filter and a Calendar tab on each class page.
- Items are marked when completed.

Still open:
- Not yet checked in a real signed-in student and teacher account.
- Students' completed items stay on the calendar as done. They are not hidden. This needs your confirmation.

### 2. Discussion Boards: built
Already working:
- Teachers can edit the prompt after posting, using "Edit prompt".
- Bold, italic and larger text work in both prompts and student replies.
- Sharing options are: this class, selected classes, or an entire grade.
- A "Grade by student" view shows each student's main response and replies, with points per post and a total that syncs to the gradebook.
- Students see only their own points once grading is done.
- Open time, due time and grading category are also built.

Still open:
- "Entire grade" covers only the teacher's own classes in that grade. "Selected classes" can reach other teachers' classes only through the edit dialog. This needs your confirmation.
- Not yet checked end to end with a student account.

### 3. Wellbeing badge: built
Already working:
- Teachers and admins see a calm count bubble next to Wellbeing, on desktop and mobile. It counts new, unanswered check-ins from their own students.
- The badge clears when the teacher visits Wellbeing and refreshes every 60 seconds.
- Students, guardians and Student View never see it. It never shows what a check-in says.

Still open:
- "Seen" is saved per device, so the badge can reappear on a second computer.
- Not yet checked in a signed-in teacher account.

## Phased plan

**Phase 1: Verify (no code changes)**
Sign in to the preview as an educator and as the Student Tester. Then check each of these:
- A due date shows on the calendar, and moves or disappears after an edit or a delete.
- A discussion can be edited, formatted, shared and graded, and the student sees only their own points.
- A new check-in raises the badge, and visiting Wellbeing clears it.
Fix anything that fails.

**Phase 2: Small refinements (only if you approve each)**
- Calendar: option to hide items a student has already completed.
- Discussions: let "Entire grade" and "Selected classes" also include other teachers' classes in that grade when sharing a new discussion.
- Wellbeing: remember "seen" in the account rather than the device, so the badge clears everywhere.

## Technical notes
- Calendar: `src/lib/calendar-coursework.ts`, `src/hooks/useCalendarCoursework.ts`, `src/components/SchoolCalendar.tsx`
- Discussions: `src/components/class/DiscussionBoard.tsx`, `FormattedText.tsx`, `src/lib/discussion.ts`, `discussion_post_scores`
- Badge: `src/lib/wellbeing-badge.ts`, `AppShell.tsx`. Storing "seen" per account needs a small per-user table with owner-only access.
- Existing gradebook, attendance and access rules stay unchanged.
