# Phase 1 teacher polish: check what's done, fill the gaps

Most of this request is already built (Nov 18 and Nov 24 passes). This pass only checks and fills gaps. No changes to grading math, roles, draft vs posted, or submission rules.

## Current state
1. Coursework tab: Current (default), Upcoming, Past/Graded and All tabs are done. So are the Due soon / Needs attention strip, collapsible categories with counts that auto-open when they have current items, Expand all / Collapse all, and search.
   Gap: quizzes and other assessments sit mixed in with homework inside categories.
2. Grading windows: the check-in & score window has one "X Close" button. Quiz grading, rubric, discussion edit and report windows show only the single X.
   Gap: the quiz grading panels use "Close grading" / "Close build" toggle buttons in each row. These are inline panels, not pop-ups, so they stay; they just get a quieter style.
3. Layout: fixes were made but never checked while signed in at laptop and tablet widths.

## What I'll do
1. Coursework: inside each open category, show "Quizzes & tests" as a small separate group under the regular work, but only when a category has both kinds. Counts and status labels stay the same.
2. Grading: make the quiz-row "Open / Close grading" toggles a single quiet button with an arrow. Confirm no pop-up shows two close controls.
3. Layout check: sign in as a test teacher and a test student, then view dashboard, class page (Coursework, Gradebook, grading window), discussions, Assignments hub, Wellbeing and Calendar at 1280, 1024, 768 and 739 px. Fix any cut-off or side-scrolling I find with the existing wrapping and min-width patterns, and attach before/after screenshots.

## Later phases (not in this pass)
- Discussion status and soft-delete follow-ups, calendar sync checks, "Show more" on Messages, Behavior log and Wellbeing.
- Privacy/Terms still list a placeholder contact email and operator name until you supply the real ones.

## Technical details
- `classes.$classId.tsx` CourseworkTab: split group items by submission mode / assessment type into two sub-lists. No changes to `coursework-view.ts` buckets.
- `AssessmentsTab.tsx` row toggles: ghost button + ChevronDown, `aria-expanded`.
- Browser checks use a signed-in test account. If sign-in fails, report which pages were only checked from the code.
