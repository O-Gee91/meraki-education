# Meraki Education – Professional LMS Audit (Nov 13, 2026)

Scope note: This audit draws on the codebase review and the fixes shipped in this project so far. I did not sign in and click through each role live in this session. The plan's first step is a scripted click-through as teacher, student, guardian and admin to confirm each item.

## 1. Dashboard & navigation
Works well: grouped educator sidebar, breadcrumbs, Teacher To-do (now includes discussions), calm palette, unread message count, wellbeing badge.
Needs to change:
- High: The staff dashboard stacks too many cards. Lead with the To-do and "Today" (classes, due today), and collapse the rest.
- Medium: The student dashboard should open with "Due this week" and "Missing", with grades second. Today, several sections compete for attention.
- Medium: The mobile nav has as many items as desktop. Put the main ones in a bottom bar and the rest under "More".
- Low: Empty states vary in wording and style. Use one shared empty-state pattern with an icon, one line of text and one action.

## 2. Class page & Coursework
Works well: timeline tabs, collapsible categories, a Due soon/Needs attention strip, the shared status labels (resolveWorkState) and the shared missing-work rule.
Needs to change:
- High: The class page has 10 tabs. Group them into 5: Gradebook | Coursework | Discussions & Community | Students (Roster, Attendance) | Settings (Grading setup, Rubrics, Library, Files).
- High: Coursework has up to 4 layers of controls (sub-tab, timeline, filter, category). Merge the sub-tabs into the type filter.
- Medium: Expanding assignment cards one at a time is tiring. Add "Expand all" and a compact list view.
- Low: Split the large class page code so later changes are less risky. Users won't see a difference.

## 3. Gradebook & feedback loop
Works well: the draft/posted split, collective posting with confirmation, computeAverage weighting, paginated columns, the averages overview tucked away by default, notifications that skip cleared scores.
Needs to change:
- High: Add a "Needs grading" count to each assignment column header, so teachers can see the queue without opening each assignment.
- Medium: Paging assignments three per page hides context. Add a "jump to assignment" picker and a sticky student column.
- Medium: Feedback for students is split between the assignment and the "Feedback from your teacher" area. Link each feedback item to its assignment.
- Low: Add a per-grade change history (who changed what and when) for staff.

## 4. Discussion boards
Works well: one completeness rule (main post plus required replies), scoring per post, sharing across classes with a single thread, open time and due time, category weighting, the deletion audit trail.
Needs to change:
- High: Add an admin viewer for deleted posts (discussion_post_audits). The audit data exists, but nothing on screen shows it.
- Medium: The grading panel is heavy. Add a compact grid with students as rows and main post/replies as columns, with inline scores.
- Medium: The scope selector (grade, then class, then sharing) should show a one-line summary such as "Visible to: 8H 123, 8H 456".
- Low: Show students the requirement checklist next to the reply box ("1 of 2 replies done").
- Low: Show classmates' names instead of "Class member". This needs a safe way to read names.

## 5. Attendance, Behavior & Wellbeing
Works well: behavior scope pills (All / My classes / Logged by me), student history sheet, targeted detention alerts, private wellbeing check-ins with a calm badge and pattern summaries.
Needs to change:
- High: The behavior filters wrap onto several lines. Keep search and scope visible and move the rest into a "Filters" popover with a count.
- Medium: Attendance has no quick "mark all present, then change the exceptions" flow, or it isn't easy to see. Make it the default.
- Medium: Wellbeing "seen" status is stored per device. Store it per account so it follows teachers across devices.
- Low: Add a weekly attendance summary per student in Pulse, so teachers aren't drawn to single absences.

## 6. Calendar & due dates
Works well: coursework syncs automatically, past items hide on their own, discussions use the full completion rule, links go to the class.
Needs to change:
- Medium: Once past items are hidden, there is no way to look back. Add a small "Show past" toggle that is off by default.
- Medium: Add an agenda (list) view for students. A month grid is hard to read on phones.
- Low: Show due times as well as dates for discussions that have `due_at`.

## 7. Student view & Guardian view
Works well: View as student is limited to the teacher's own classes and is read-only; guardians with several children get a picker; only posted grades are visible; 2FA with a bilingual guide.
Needs to change:
- High: Guardians can't switch child on class pages. Add the child picker there too.
- Medium: The guardian home page should show one summary card per child: average, missing work and the next due item.
- Medium: The student Assignments hub now has a class filter. Also add a "Missing only" shortcut on the dashboard that links there.
- Low: The Student View banner should name the class being previewed.

## 8. Admin
Works well: People & roles, approval of school-domain email accounts, 2FA status, co-teacher permission levels.
Needs to change:
- Medium: The People page is a wall of buttons. Use a table with a single actions menu on each row.
- Medium: Add an admin audit hub covering deleted posts, grade changes, role changes and sign-ins.
- Low: The Master Schedule & Coverage Hub is still unbuilt (proposed earlier).

## 9. Visual calmness & cognitive load
Works well: no gamification, amber for attention and red only for destructive actions, one main button per area.
Needs to change:
- Medium: Use the same status words everywhere ("Needs grading", "Missing", "Submitted", "Graded"). Some places still say "Ungraded".
- Low: Use consistent card spacing and heading sizes on pages not yet reviewed (reset password, OAuth consent).

## Recommended order of work
1. Verify the findings with a scripted click-through as each role.
2. High items: consolidate class tabs, simplify coursework controls, needs-grading counts, deleted-post viewer, behavior filter popover, guardian child picker on class pages, staff dashboard focus.
3. Medium items, one area at a time with the desktop review gate.
4. Low items.

## Technical notes
- Keep the shared helpers as the only source of truth: computeAverage, isMissingWork, resolveWorkState, resolveDiscussionState, fetchDiscussionCompletions.
- Roll out new presentation through the opt-in desktopReview props, and track it in desktop-ui-audit.md and roadmap.md.
- The deleted-post viewer must be admin-only and read discussion_post_audits through the existing access rules.
