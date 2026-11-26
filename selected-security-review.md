# Selected security fixes — November 25, 2026

## Rule
Sign-in links must stay in Meraki; private files and account roles must respect current access; students cannot choose their hand-in time; recovery requests must not flood inboxes; private school emails must go only to authorized recipients.

## Scope and source review
Only the seven requested scan findings were considered for fixes. No other finding was fixed or ignored. Existing sent notices, settled grades, historical hand-in times and other settings were not changed.

| Place reviewed | Result |
|---|---|
| AuthPage: password sign-in, second-factor completion and signup confirmation destination | All share safeNext; now reject backslashes, encoded separators, control characters and external origins. |
| Session-expiry redirect | Encodes the local path/query into the auth next value; hardened auth validation applies. No separate change. |
| OAuth consent redirect | Comes from authorization-server approval/denial, not the auth next value. Left unchanged. |
| Forgot-password page and requestPasswordReset | Neutral UI response retained; server claims an atomic hashed-address fifteen-minute cooldown before lookup and adds send idempotency. Quota errors deny sending. |
| AssignmentWork submission save and direct assignment_submissions writes | Both pass through the same trigger; student inserts/backdated timestamp updates are server-stamped. Draft-to-hand-in transition also receives server time. Staff overrides retained. |
| has_role and its policy callers | Caller can check self; admins/service work can check others. is_admin/is_staff read their own role directly, avoiding recursive policy checks. |
| School and class Files using FileLibrary | Every Open action now downloads with current authenticated storage access instead of issuing a one-hour bearer URL. Previously downloaded bytes cannot be recalled. Previously issued links naturally expire; no storage signing secrets were rotated. |
| AssignmentWork submission attachment link | Separate ten-minute signed URL path read; not the selected school-files finding, therefore left unchanged. |
| notifyGradesPosted / notifyCourseworkPosted | After user approval, both resolve linked IDs to current email-confirmed Auth accounts. Editable contact/profile addresses are never destinations; missing/deleted/unverified accounts and lookup failures skip sending. |
| StudentProfile, roster/import/login creation contact-email references | Contact editing and account linking are outside selected scope and were not changed. Delivery boundaries enforce the approved destination rule. |

## Verification
- Temporary student: actual insert and direct timestamp update with a backdated time both read back as late with current server time.
- Temporary student: own role returns true; a known other teacher role returns false.
- Recovery page: first and repeated requests for a nonexistent QA address show the identical neutral result; durable limit row verified. No real recovery email sent.
- Temporary admin: isolated file uploaded and content downloaded through the UI; observed no signed URL request. Test file and isolated class/student/assignment removed afterward.
- Unit regressions cover malicious return paths, recovery quota denial/failure, allowed recovery delivery and fresh file permission checks; database function definitions verified after migration.
- Other reported security issues remain active. Rescan after publishing; these checks are not advanced penetration testing.

## Approved email-recipient follow-up
Rule in the user's terms: grade and coursework emails go only to verified linked accounts, never a manually entered guardian contact address. Already-sent emails and settled grades remain unchanged.

Code-read coverage:
- AssignmentWork individual grade posting and Post All draft release: both call notifyGradesPosted; the new restriction applies without changing grading.
- Class Coursework bulk grade release: calls the same notifyGradesPosted; compliant through the shared boundary.
- Class Coursework new assignment, copies to sibling classes and existing draft publication: use useNotifyCoursework, which calls notifyCourseworkPosted; compliant through the shared boundary.
- AssessmentsTab quiz/test/essay publication: uses PublishNotifyDialog/useNotifyCoursework and the assessment branch of notifyCourseworkPosted; compliant through the shared boundary.
- NotifyChoices/PublishNotifyDialog: student and parent choices remain unchanged; recipient note now states the verified-linked restriction.
- Grade/coursework templates, registry and sendTemplateEmail: read and confirmed no fixed recipient override in these templates; sender and unsubscribe behavior unchanged.
- Repository-wide send-call and migration search: no other grade/coursework email sender, recurring job or database email function found. In-app alerts, messages, recovery and two-step emails are outside this two-finding scope and remain unchanged.

Verification: 194 tests pass, including real server handlers with a mocked email transport and account lookup for both assignments and assessments: verified destinations, contact-only exclusion, unverified-account exclusion, lookup failures, drafts, tester exclusion and permission checks. Preview build is OK. No real grade/coursework email was sent in this follow-up; live recipient delivery was not exercised.

Only lov_finding_3257610908c2fd28 and lov_finding_b34ad7554855bd24 are updated in this follow-up. Other scan statuses, permissions and account linking are untouched.

## Six selected account/ownership findings — November 26, 2026

Rule: teachers can help students in their own classes without attaching an unrelated existing account, replacing an established account link, or taking another teacher's class; administrator access cannot be self-claimed.

| Code-read surface | Result |
|---|---|
| UnlinkedAccounts, getUnlinkedAccounts, listUnlinkedAccounts, linkSelfRegisteredAccount, linkAccountToStudent | Picker and write boundary require matching non-staff pending accounts; both student and guardian links exclude already-linked identities. Empty destination links are checked at the write. Existing teacher student/class scope remains. |
| CreateLogins and ClassLogins, provisionStudentAccounts, provisionRosterAccounts | Both flow through the same validated and student-scoped handler. Stored account links authorize reuse; caller IDs cannot redirect it. Contact email no longer resolves an existing identity; existing unlinked accounts use the pending-account flow instead. New username logins and linked-account password reissues remain supported. |
| ResetAccess, resetStudentAccess, resetAccountAccess | Strict identifier validation precedes querying; separate equality lookups replace filter interpolation. Student scope, staff-account protection and administrator access remain. |
| registerMyEmail, editable contact profile fields, roster email lookup | Contact registration stays available, but those fields cannot grant student-record access through provisioning. No email verification settings or past contacts changed. |
| Dashboard SetupCard, claim_first_admin | Removed self-claim action and disabled function body and public execution grants. Two existing administrators remain unchanged. |
| ClassesPage saveClass, CoTeachersPanel, classes update policy, guard_class_owner_change | Ordinary class editing and co-teacher management retained. New database trigger prevents a co-teacher from changing the primary teacher, including direct database requests; primary teachers and admins retain ownership management. |
| Repository-wide callers of the three account server helpers and ownership writes | No separate background account-linking/reset job or alternate class-ownership writer found. No unrelated findings or data were changed. |

All 214 regression tests pass, including 13 new account-security tests. Only the six selected findings were marked fixed.

Verification: focused account, recovery, notification and wellbeing regression tests pass. Live database checks confirm public administrator-claim execution is revoked, the ownership trigger is installed and the two administrators are unchanged. Rollback-only identity tests are retained but cannot run through the managed connection: it cannot execute permission helpers or assume the authenticated role; both attempts rolled back all fixtures. Genuine browser restoration ended on /auth, so signed-in account actions remain unverified. No real student password, account link, contact, grade or enrollment was changed.