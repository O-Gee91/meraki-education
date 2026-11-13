# WCAG 2.2 AA Accessibility Audit — Meraki Education

Scope note: based on a code scan of every page and shared piece of the app. No screen-reader or keyboard click-through was run this session; items marked "verify" need a live check. Step 1 of any fix work is a keyboard + screen-reader pass as teacher, student and guardian.

## Working well (keep)
- Page language is set (English), most screens use the built-in dialog, menu and dropdown pieces that already handle keyboard and screen-reader roles.
- Each signed-in page has a single main content area.
- No drag-and-drop anywhere, so 2.5.7 (Dragging Movements) passes.
- Grade states use text labels ("Draft", "Posted", "Needs grading", "Missing") alongside colour.

## High — daily teacher/student impact
1. **2.1.1 / 4.1.2 Gradebook cells and score inputs** (class page Gradebook). Score cells, mark codes (M, EX) and the paginated assignment arrows must be reachable by Tab, have names like "Score for Dora, Lab 3", and announce draft/posted state. Fix: label every input with student + assignment; give arrows "Previous/Next assignments" names.
2. **4.1.3 Status messages** — only ~8 places announce changes. Save draft, Post grade, Post all, attendance marks, message sent, wellbeing submitted, and filter result counts are silent to screen readers. Fix: polite live region for toasts and result counts ("12 assignments shown").
3. **2.4.11 Focus Not Obscured** — the sticky top bar (AppShell) and sticky class header/tab bar can cover the focused row when tabbing down the gradebook, coursework list and assessments (TakeAssessment sticky bar). Fix: scroll padding equal to sticky header height.
4. **2.4.1 Bypass Blocks** — no "Skip to main content" link; keyboard users tab through the full grouped sidebar on every page. Fix: add a skip link in AppShell.
5. **4.1.2 Icon-only buttons** — ~23 icon buttons to verify for names, incl. Classes list (row actions), Behavior log, Messages (reply/delete), Students table actions. Fix: aria-label on each.
6. **1.4.1 Use of Color** — Pulse stoplight dots, wellbeing badge, unread-message dot and calendar category colours rely on colour. Fix: add text/icon ("At risk", "Unread", category name).

## Medium
7. **2.5.8 Target Size (24×24)** — small chips/pills (class sub-section buttons, behavior scope pills, calendar audience chips, discussion "Show replies", unread dot links). Verify each is at least 24px or spaced.
8. **1.3.1 / 3.3.2 Form labels** — native dropdowns in Assignments (has label), Class logins and Discussion category: confirm visible labels are tied to the field. Wellbeing emoji mood picker needs a group name and text label per choice ("Okay", "Struggling").
9. **1.3.1 Tabs** — the new custom 5-section class tab bar and secondary pill switcher must use tab roles with selected state and arrow-key movement, or plain buttons with "current" state.
10. **2.4.3 / 2.1.2 Focus order** — after closing dialogs (Grade by student, Student history sheet, MFA setup guide), focus should return to the button that opened it; the student 2FA gate must not trap focus away from Sign out.
11. **1.4.3 Contrast** — muted helper text at small sizes, amber "Draft" badges and the "Scheduled/Locked" discussion badges need checking against 4.5:1.
12. **1.2.2 Captions** — the 2FA computer video has burned-in captions; add a text transcript (1.2.1) for both videos.
13. **3.3.1 Error identification** — sign-in, 2FA code and grading errors should be linked to the field, not only shown as red text.

## Low
14. **1.1.1** Landing page hero image — confirm it has descriptive or empty alt text.
15. **1.3.1** Students table cells with click handlers only stop row-click; confirm row navigation also works via a real link/button.
16. **2.4.6 Headings** — check heading order (no jumps) on Dashboard and class sections.
17. **1.4.10 Reflow** — gradebook at 320px wide; pagination helps, verify no two-way scrolling.
18. Full-height layouts use h-screen in three places; switch to dynamic viewport height for mobile.

## Proposed next step (after approval)
Run a live keyboard + screen-reader-style (automated axe) pass as teacher, student and guardian to confirm the "verify" items, then fix High items 1–6 first.
