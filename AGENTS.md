<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Student-facing overall grades must use `computeAverage` with each class's grading setup; this keeps weighting, special marks, and extra credit consistent across views.
- Keep desktop UI audits in `desktop-ui-audit.md` and track page review gates in `roadmap.md`; this preserves the requested one-page-at-a-time review sequence.
- Apply reviewed desktop shell presentation through the opt-in AppShell desktopReview prop; this keeps unrevised pages unchanged until their review gate.
- Scope Community conversation presentation through ClassFeed's opt-in desktopReview prop; this preserves the previously reviewed class feed presentation.
- Scope reviewed educator-request presentation through StaffRequests' opt-in desktopReview prop; this preserves other request surfaces until their own review gate.
- Scope the reviewed school Files presentation through FileLibrary's opt-in desktopReview prop; this preserves class and student file surfaces and upload behavior.
- Paginate class gradebook assignment columns independently of the filtered data set; this prevents horizontal scrolling while keeping averages, missing counts and printing based on all filtered assignments.
- Keep educator navigation groups and shared breadcrumbs in AppShell, with class pages supplying their class name and controlled active-tab context; this keeps navigation consistent without changing student/guardian menus or class-scoped grading.
- Share grade-value eligibility through the grading helpers at both the score-save alert and server-send boundaries; this prevents cleared scores from becoming grade notifications on any release path.
- Run unit tests with the dedicated Vitest configuration rather than the app's RPC transform; this allows mocked server handlers to execute directly without deployment routing.
- Keep calendar category, color and audience transitions in shared calendar-form helpers; this lets regression tests cover every holiday visibility path used by the form.
- Global "View as student" lives in useAuth (previewingStudent/realStaff) with student-owned data scoped via useSelfStudents/useTeacherScope; staff RLS reads every row, so preview screens must filter explicitly and block writes.
- Wellbeing feeds use the active staff hat and verified co-teacher membership, with snapshot caches keyed by viewer and hat; this preserves admin visibility and co-teacher access without sharing cached role scopes.

- Rule: Discussion sharing uses one discussion row per class (linked by share_group); shared threads point thread_id at a host discussion so posts live in one place while each class keeps its own gradebook assignment. Per-post scores live in discussion_post_scores and their sum is synced to grades.
- Missing work is decided only by `isMissingWork` in src/lib/missing-work.ts; every screen counting missing work must use it so counts agree.
- Derive coursework status labels through resolveWorkState in src/lib/coursework-state.ts; one precedence order keeps every screen's status wording consistent.
- Derive discussion participation labels through resolveDiscussionState in src/lib/discussion-state.ts; grading views share one completeness rule.

- Two-factor sign-in uses built-in Auth MFA for TOTP; backup and email recovery codes are hashed server-side and, when used, remove the authenticator (Auth cannot grant aal2 from custom codes).
- Discussion completion (main post + required replies) counts as turned in via withDiscussionSubmissions/fetchDiscussionCompletions in src/lib/discussion-completion.ts; discussions store work in posts, not assignment submissions, so the shared missing rule needs it.
- Passkey second-step state lives in passkey_sessions keyed by the auth session_id; Auth MFA cannot grant aal2 from WebAuthn, so needsSecondFactor and the student gate check passkeys alongside TOTP.
- Keep the tslib alias to its ESM build in vite.config.ts; the CJS build breaks server bundle interop (passkey libraries) and takes the live site down.
- Dropping or moving a student archives the enrollment into dropped_enrollments via a delete trigger; active rosters stay unchanged while old grades remain viewable.
