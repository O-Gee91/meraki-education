# Desktop UI checkup

## Scope and evidence
Desktop PC/Mac browser layouts. Review order: auth, landing, dashboard, remaining pages individually. No changes to grading, permissions, data or workflows.

Auth and landing were visually checked in Chromium at 1280px, with desktop overflow checks at 1024px, 1440px and 1920px. Other entries are source-review findings or risks, not authenticated visual verification. Safari/macOS-specific rendering remains unverified. Recheck each page with real visible data before its fix.

Impact means difficulty completing or scanning a task, not severity of a functional bug. Wide data tables need a dedicated design decision: preserve every score while preventing horizontal desktop scrolling, rather than merely hiding overflow.

## Ranked page inventory
| Impact | Page | Layout and clutter findings | Planned presentation fix | Status |
| --- | --- | --- | --- | --- |
| High | /classes/$classId | Unbounded shared content width; many tabs/actions and wide grade matrices risk desktop scrolling. Coursework summaries compete with the ledger. | Bound the shell, wrap navigation cleanly, separate filters and paginate gradebook columns without losing scores. | Fixed and approved; staff dialogs unverified |
| High | /dashboard | No shared maximum width; repeated role switchers/scope descriptions in the desktop shell. Student secondary panels push upcoming work lower. | Cap content width, give upcoming work clear priority, consolidate duplicated role controls. | Fixed and approved |
| Medium | /auth | Promotional panel consumes 40% of the display; form starts at different heights as tabs change; registration is 760px tall, with a single-choice role menu and long eligibility copy. No explicit page heading in the normal form. | Bounded, top-aligned forms; clear heading; compact paired registration fields, concise eligibility text, one primary submit action. | Fixed and approved |
| Medium | / | Large split promotional section; repeated feature descriptions across modules/pillars/audiences; repeated sign-in/start actions; empty paragraph used for spacing. | Reduce repetition, use one primary CTA in the visible screen, maintain clear Meraki identity and bounded section widths. | Fixed and approved |
| Medium | /students | Wide directory separates names from row actions; multiple management tools can overwhelm the directory. | Bounded four-detail-column directory and collapsed secondary tools. | Fixed and approved; staff-only controls unverified |
| Medium | /reports | Wide report tables/standards descriptions hinder scanning; several report modes share space. | Cap width, prioritize coverage and selected mode, group secondary actions. | Fixed and approved; populated staff report cards and print controls unverified |
| Medium | /behavior | Full-width note/log grids and strike sections become overly stretched; multiple tabs/actions compete. | Bound content, align filters and section headings; verify grade-filtered strike tracker. | Fixed and shown; awaiting review |
| Medium | /wellbeing | Wide responses and strategy tips create long lines and uneven feed rhythm. | Bound reading width, standardize response spacing; preserve dates/responders. | Awaiting review |
| Medium | /messages | Wide message text and separated metadata slow scanning. | Bound inbox/detail reading widths and distinguish the main compose action. | Awaiting review |
| Medium | /community | News and group content can expand into long lines, with several competing regions. | Bound news reading width and clarify section hierarchy. | Awaiting review |
| Medium | /people | Role-management actions drift away from names on wide displays. | Bound list width, align role controls with identities. | Awaiting review |
| Low | /classes | Cards scale reasonably; filters and New class can become disconnected on wide screens. | Bound grid and align toolbar. | Awaiting review |
| Low | /files | Broad empty/list states; upload and sharing tools need hierarchy checks with populated data. | Bound library and multi-class upload controls; keep one primary upload action. | Awaiting review |
| Low | /settings | Existing max-w-lg panels already constrain forms; still needs alignment with the common shell. | Verify spacing and primary save/password action, avoid unnecessary redesign. | Awaiting review |
| Low | /forgot-password | Existing bounded form and one main action; styling/position differ from updated auth. | Align with approved auth pattern; preserve reset behavior. | Awaiting review |
| Low | /reset-password | Existing bounded form; success/expired states need consistency checks. | Align recovery form/states with approved auth pattern. | Awaiting review |
| Low | /.lovable/oauth/consent | Bounded approval dialog already has one primary and one secondary action; long app names may wrap poorly. | Verify long-name/error-state wrapping, preserve approval semantics. | Awaiting review |

## Shared issues to address at the dashboard stage
- AppShell has no main-content maximum width; its page header and content can drift apart on large monitors.
- Desktop shows role switching twice, plus repeated role scope descriptions.
- Header action group does not wrap independently when crowded.
- Keep page scrolling vertical. Do not mask missing columns or controls using overflow-hidden.
- Keep existing theme colors; reduce repeated borders/shadows through hierarchy, not a new palette.

## Auth checks completed
- Sign-in and account-creation forms render with a shared fixed top anchor.
- Registration form reduced from 760px to 481px at the tested desktop width.
- Registration submit stays visible at 900px height at desktop widths 1024/1440/1920.
- No horizontal page scrolling at those widths.
- One primary submit button per active tab.
- Approved-domain email hides the approval reason field as before.
- Password recovery link reaches /forgot-password; no runtime errors observed.
- Latest preview build reports build OK.
- No account was created and no password changed; successful authentication was not tested as part of this presentation change.

## Review gate
Auth, landing, dashboard, class page, Students and Reports approved. Behavior updated and shown; wait for Joe's Behavior review before changing Well-being.

## Landing checks completed
- Kept the existing Meraki image, now full-width behind the brand heading rather than a floating image card.
- Removed duplicated module cards and the repeated bottom promotional CTA; kept detailed pillar descriptions in expandable sections.
- One primary sign-in button, with a secondary footer account link.
- Consistent max-width-6xl section alignment and 48/64px section spacing.
- No horizontal scroll at 1024/1440/1920 desktop widths; also checked 390/767 widths.
- Next section heading remains visible within all tested first viewports.
- Details expand/collapse and sign-in navigates to /auth; image loads, no runtime errors, preview build OK.
- No dashboard or authenticated page presentation was changed.

## Dashboard ranked issues and fixes
1. High — Upcoming work appeared below hero details, summary tiles and classes/news. Moved due dates directly below the summary; feedback and scores now precede the calendar and hero details.
2. High — Unbounded desktop header/content stretched on large monitors. Dashboard opts into a shared max-w-6xl header/content alignment; other pages do not opt in yet.
3. Medium — Five student summary cards overflowed a four-column grid into an uneven second row. Replaced them with an unframed summary strip, five columns on wide desktop and wrapping at narrower widths.
4. Medium — Repeated section cards, role switchers and scope labels added clutter. Classes, announcements, due dates and scores now use quiet dividers; staff keep only the sidebar role switcher on desktop, with the header switcher retained below the sidebar breakpoint.
5. Low — Long class names and score-table titles could squeeze adjacent details. Class rows wrap; the recent-score table uses stable column tracks with wrapping titles.

### Dashboard verification
- Real signed-in student account: two classes, 56.4% overall grade, attendance, feedback and recent scores render; grade calculations unchanged.
- No desktop horizontal overflow at 1024/1440/1920px; due-date heading moved from y=719/655/655 to y=366/222/222.
- Updated dashboard screenshot inspected at 1280×1800.
- Calendar collapse/expand and class navigation passed in the signed-in dashboard; preview build reports OK.
- Staff layout changes reviewed in source only: the available requesting-user account is student-only. No other account was selected without permission.
- Safari/macOS-specific rendering remains unverified. No remaining page has been started.

## Class page ranked issues and fixes
1. High — Assignment columns required horizontal table scrolling. Show three assignment columns per page with named Previous/Next controls and page/range indicators. Current grade and missing counts remain based on all filtered work; print still includes all filtered assignments.
2. High — Header/content lacked a maximum width. Opted this page into the approved desktopReview shell alignment.
3. Medium — Tabs used wrapping within a fixed-height bar. Changed the class tab bar to auto-height with wrapping, consistent gaps and a quiet divider; grading setup uses semantic theme colors.
4. Medium — Teacher filters competed with the heading and print control. Moved filter controls into their own full-width aligned grid beneath a divider.
5. Medium — Student feedback appeared ahead of the grade ledger. Moved it below the ledger and removed the ledger's floating-card shadow; retained all feedback and existing progress/missing-work controls.

### Class page verification
- Signed-in student class with 11 real assignments: all 11 unique headers reachable across four pages; Previous and Next work, last-page Next disabled.
- Saved score 12 and Missing mark visible in the inspected final screenshot; class average and missing-count logic unchanged.
- No horizontal page or gradebook-table overflow at 1024/1440/1920px.
- Coursework, discussion, roster, attendance, files and gradebook tabs open without page overflow at 1280px.
- Preview build OK; final populated screenshot inspected at 1280×1800.
- Staff filter layout, full roster, grading dialogs and print behavior were source-reviewed only; available requesting-user session is student-only. Staff visual verification remains open, not claimed complete.
- Safari/macOS rendering remains unverified; no next page started.

## Students ranked issues and fixes
1. High — Seven detail/action columns crowded identities and account details, especially with editable IDs and long emails. Combined grade/graduating class and account/guardian details into four fixed-width detail columns, with separate staff selection/actions; long names/emails wrap and ID inputs fit their column.
2. Medium — Directory/header stretched on wide monitors, distancing names from actions. Opted Students into the approved max-w-6xl desktopReview shell.
3. Medium — Import, class logins and account creation competed with the main action. Kept Add student as the primary header action; moved secondary management tools into a keyboard-accessible, default-collapsed Directory tools disclosure. Waiting-account management follows the directory.
4. Low — Floating panel shadow, uppercase headings and strong grade bands added visual noise. Removed the directory card treatment, softened group bands and aligned search, sorting and result count; reserved a stable selection toolbar area. Student names are now keyboard-accessible profile buttons; destructive row actions use named trash icons.

### Students verification
- Available requesting-user session remains student-only: the direct Students page renders one real saved student; no staff session selected without permission.
- At 1024/1440/1920px, no horizontal page or directory-table overflow. Table width caps at 1104px on large screens.
- Search returns the existing student and the empty result state; clicking the saved student's name opens their profile.
- Directory tools expand/collapse; spreadsheet import and Add student dialogs open and close without changing records.
- Final screenshot inspected at 1280×1800; preview build OK.
- Populated staff rosters, admin tools, bulk removal and ID editing are source-reviewed only, not authenticated end-to-end verified. Long-name/email wrapping is source-reviewed, not tested against real long-name records.
- Safari/macOS-specific rendering remains unverified. Reports has not been changed.

## Reports ranked issues and fixes
1. High — Six report-card columns compete for space with editable comments and publication buttons. Combined class/term, used fixed proportional columns, wrapping names/terms/comments and full-column secondary publication controls. Kept saved percentages, comments and publish behavior unchanged.
2. Medium — Unbounded width stretches report rows; compact four-column forms squeeze notes beside action buttons. Opted Reports into desktopReview max-w-6xl alignment, wrapped tab navigation, and used two-column portfolio fields with a separate Add work action. Standard creation now uses a secondary disclosure with more balanced fields.
3. Medium — The fully expanded ELA catalog pushes actual coverage below a very long list. Coverage now comes first with readable line lengths; the original catalog is preserved behind a default-collapsed disclosure.
4. Low — Repeated section cards, template selection rings and primary publication buttons add visual noise. Replaced section cards with quiet dividers, kept borders only for repeated portfolio/template items, and changed template choices to accessible pressed-state controls. Template selection, print/download output and calculations remain unchanged.

### Reports verification
- Real requesting-user student session at /reports: all three student tabs render; two existing standards and their descriptions appear in coverage.
- No horizontal page overflow at 1024/1440/1920px across the report-card, standards and portfolio tabs. Main width caps at 1152px.
- ELA disclosure expands/collapses, search finds RL.5.1, and Literature strand collapse/expand works against the actual catalog.
- Portfolio title/note fields accept drafts and Add work remains visible; no records created, removed or changed.
- Updated standards and portfolio screenshots inspected at 1280×1800; no runtime errors; preview build OK.
- This student has no published report cards or portfolio artifacts. Populated report-card rows, staff generation/comment/publication controls, template choices and printing are source-reviewed only, not authenticated end-to-end verified.
- Safari/macOS-specific rendering remains unverified. Behavior has not been changed.

## Behavior ranked issues and fixes
1. High — Wide displays stretched names, notes and controls across 1664px. Opted Behavior into the reviewed max-w-6xl shell; header and content now cap at 1152px. The note form has a stable 20rem track on wide desktop, stacking above the log at narrower desktop widths.
2. High — Detention fields wrapped into irregular rows, with placeholder-only labels. Replaced the wrapping toolbar with aligned, labeled fields: two columns on narrower desktop, five tracks on wide desktop; kept existing save-on-change/blur behavior.
3. Medium — Long red note badges competed with names, while strike indicators wandered according to name length. Names now lead each note/strike row, with date and reason beneath; strike progress and detention-required labels use a stable secondary column. Subtle theme tints retain explicit status text and numeric cycle counts.
4. Low — Repeated floating panels, boxed tabs and text Edit/Delete controls added noise. Replaced section panels with quiet dividers, wrapped the tab bar, and used named pencil/trash controls. Log note remains the primary action; inline Save is secondary.

### Behavior verification
- Current signed-in account now has staff access: verified 56 saved notes, 34 strike-tracker students (33 Grade 8, one Grade 9) and three detentions in Admin mode.
- All three tabs have no horizontal page overflow at 1024/1440/1920px in both Admin and Teacher modes; content caps at 1152px on wide desktop.
- Grade 8 selection displays 33 students; All grades restores 34. Original grade grouping and strike-count ordering are unchanged.
- Opened an existing note editor, confirmed its saved text, typed a temporary draft and canceled; no save or deletion sent. Detention controls were visually inspected without editing records.
- Inspected populated log, tracker, detention, note-editor and Teacher-mode screenshots at 1280×1800. No browser runtime errors; preview build OK.
- Student/guardian presentation reviewed in source only; no student or guardian account impersonated. Safari/macOS-specific rendering remains unverified.
- No business rules, permissions, database queries or records changed; no next page started.