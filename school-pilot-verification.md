# Meraki Education — school pilot verification

Date: 25 November 2026. This is a verification-and-fix pass, not a school-launch certification.

## Works well
- Public Privacy and Terms pages return 200 locally and on the live primary HTTPS domain. Footer links navigate correctly; sign-in includes both legal links.
- Public sitemap and favicon load. Unknown URLs return a branded 404 with home/sign-in navigation.
- Live home, Privacy and Terms responses include HSTS, nonce-based CSP, nosniff, referrer policy, permissions policy and frame protection. No missing headers among this checked set.
- Public pages have no horizontal overflow at 1280×800, 1024×768 and 788×776, at normal browser zoom.
- Shared grading, missing-work, enrollment/transfer, discussion status, calendar audience and wellbeing scope regression tests pass.
- No recognized literal private-key/service-role-token patterns found in tracked source. This is a targeted source scan, not a full repository-history or deployed-bundle forensic scan.

## Confirmed P1 problems and fixes
| Location | Problem | Implemented fix |
|---|---|---|
| Assignment grading late-status dialog | Penalty percentage was saved as metadata but never applied to a score. | Hide the nonworking percentage control/display. Preserve historical metadata, lateness auditing and existing scores. Late status uses amber rather than destructive red. |
| Class Coursework → Needs Attention | Summary counted saved draft grades, but clicking it selected only ungraded work. | Dedicated attention filter includes ungraded work **or** draft grades awaiting posting, with a clear-filter action. Existing quick filters remain separate. |
| Calendar coursework completion | Missing marks and empty grade rows could show Completed; ungraded discussions counted only a main post. | Use shared coursework state for assignments and shared main-post + required-reply criteria for every discussion. Deleted replies do not count. Only submitted/reviewed assessments count. |
| Guardian aggregate calendar | One child's completion could hide another child's unfinished work. | Mark Complete only when all linked children enrolled in that item's class are complete. Children in other classes do not block it. |
| Calendar and discussion completion reads | Several count-feeding queries were still single requests subject to row limits. | Use ordered fetchAll reads for calendar work, submissions, grades, discussion definitions, student mapping and audit lists. |
| Original discussion audit content | Teachers could access original removed text even though moderation is required to be admin-only. | Applied and re-read database policy requiring is_admin(). Both audit readers are admin-gated and caches include viewer identity/active role. Normal thread placeholders and delete auditing remain intact. |
| Password recovery | Caller supplied an arbitrary return origin. | Validate exact approved app origins before account lookup or link creation; reject unrelated hosting domains. Neutral responses do not disclose account existence. |

No grading calculations, attendance calculations, category weights, stored grades, transfers, or wellbeing access scopes were changed.

## Cross-role test matrix
| Area | Evidence this pass | Remaining check |
|---|---|---|
| Dashboard and class navigation | Source/shared-rule tests; existing layouts retained | Populated teacher/student/guardian/admin screens at laptop/tablet sizes |
| Coursework | Existing four timeline tabs, search and collapsible categories confirmed in source; attention regression tests added | Populated filtering/collapse interactions |
| Gradebook and grading | Main scoring window retains a single X Close; existing history, draft/post and print paths retained | Real score draft→post→student readback, history and printing |
| Assignments hub | Explicit published assignments/posted grade queries, shared missing-work and enrollment checks inspected | Student/guardian readback, child switching |
| Discussions | Shared completion tests; database soft-delete/audit functions inspected; admin-only policy confirmed after application | Create/reply/delete/readback with real roles |
| Calendar | Ten new query-level tests exercise completion, family scope, deleted replies and >1000 rows; due-date update code inspected | Create/edit/delete and visible due-date readback |
| Wellbeing | Existing nine access tests and badge tests pass | Populated privacy, active-hat/co-teacher scope and badge walkthrough |
| Messages | Existing send/read paths retained | Send, recipient read and read-receipt walkthrough |

## Session/preview limitations
- Restored Joe Doyle session reaches genuine two-step passkey verification at /auth. It did **not** open as Student Tester.
- No real device credential is available to the browser harness; no security bypass was attempted.
- Consequently protected role flows above remain unverified, not passed. Do not interpret passing unit tests as signed-in end-to-end verification.
- No confirmed P0 was established by the checks performed; untested paths are not certified safe.

## Security and recovery limits
- **Configuration tracking requirement blocked:** `.env` is tracked, despite matching an ignore rule. The platform explicitly refuses removing it because published builds require it. It contains public connection/project configuration and publishable keys, not a service-role/private credential. Values were not printed or changed. Untracking is not complete.
- Configured email domain is reported Active. Sending code uses the existing notify.meraki-education.app sender. No actual recovery email was sent, so delivery and template/sender alignment remain unverified; there is no newly confirmed DNS outage.
- Nonexistent-address forgot-password request completes with neutral confirmation and returns to sign-in. Direct reset without a recovery link correctly shows Reset link needed. Actual recovery-link password replacement is unverified.
- Logout and TOTP/passkey/email/backup paths were source-reviewed only. Existing TOTP aal2 short-circuit remains in place.
- App-specific throttling for public recovery/second-factor endpoints was not proven; platform/provider limits must not be mistaken for a verified per-user/IP recovery quota. Follow-up security review is needed before a wider rollout.

## P2 / next review prompts
1. Confirm the actual legal operator and monitored privacy contact; current values are still unconfirmed.
2. Complete one real-device passkey/TOTP sign-in, then run the protected-role test matrix one page at a time.
3. Verify delivered password-reset and backup/email-code recovery on a designated test account without changing real school users.
4. Review public recovery/second-factor throttling and failure handling; do not conduct a load test against real accounts.
5. Consider Show more for intentionally recent-only messages/behavior/wellbeing lists only as a separate request; no feature expansion here.

## Release notes
Verification result: 136 tests across 23 files pass; latest preview build is OK. Public navigation/recovery walkthrough has no browser runtime errors. All content routes have app-specific page metadata.

The audit restriction is already applied to the shared database. Frontend/server-function changes require publishing to reach the live site. Tests and preview checks do not certify Safari, real-device passkeys, or every deployed client artifact.