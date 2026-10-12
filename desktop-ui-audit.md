# Desktop UI checkup

## Scope and evidence
Desktop PC/Mac browser layouts. Review order: auth, landing, dashboard, remaining pages individually. No changes to grading, permissions, data or workflows.

Auth and landing were visually checked in Chromium at 1280px, with desktop overflow checks at 1024px, 1440px and 1920px. Other entries are source-review findings or risks, not authenticated visual verification. Safari/macOS-specific rendering remains unverified. Recheck each page with real visible data before its fix.

Impact means difficulty completing or scanning a task, not severity of a functional bug. Wide data tables need a dedicated design decision: preserve every score while preventing horizontal desktop scrolling, rather than merely hiding overflow.

## Ranked page inventory
| Impact | Page | Layout and clutter findings | Planned presentation fix | Status |
| --- | --- | --- | --- | --- |
| High | /classes/$classId | Unbounded shared content width; many tabs/actions and wide grade matrices risk desktop scrolling. Coursework summaries compete with the ledger. | Check each tab and grading/report dialog; constrain sections, consolidate tools and devise a no-horizontal-scroll gradebook layout without losing scores. | Awaiting earlier page reviews |
| High | /dashboard | No shared maximum width; repeated role switchers/scope descriptions in the desktop shell. Student secondary panels push upcoming work lower. | Cap content width, give upcoming work clear priority, consolidate duplicated role controls. | Fixed; awaiting review |
| Medium | /auth | Promotional panel consumes 40% of the display; form starts at different heights as tabs change; registration is 760px tall, with a single-choice role menu and long eligibility copy. No explicit page heading in the normal form. | Bounded, top-aligned forms; clear heading; compact paired registration fields, concise eligibility text, one primary submit action. | Fixed and approved |
| Medium | / | Large split promotional section; repeated feature descriptions across modules/pillars/audiences; repeated sign-in/start actions; empty paragraph used for spacing. | Reduce repetition, use one primary CTA in the visible screen, maintain clear Meraki identity and bounded section widths. | Fixed and approved |
| Medium | /students | Wide directory separates names from row actions; multiple management tools can overwhelm the directory. | Bounded directory and consolidated secondary tools; verify long names and full rosters. | Awaiting review |
| Medium | /reports | Wide report tables/standards descriptions hinder scanning; several report modes share space. | Cap width, prioritize selected report mode, group secondary actions. | Awaiting review |
| Medium | /behavior | Full-width note/log grids and strike sections become overly stretched; multiple tabs/actions compete. | Bound content, align filters and section headings; verify grade-filtered strike tracker. | Awaiting review |
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
Auth and landing approved. Dashboard updated and shown; wait for Joe's dashboard review before changing any remaining page.

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
- Staff layout changes reviewed in source only: the available requesting-user account is student-only. No other account was selected without permission.
- Safari/macOS-specific rendering remains unverified. No remaining page has been started.