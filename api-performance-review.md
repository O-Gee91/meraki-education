# API performance update — November 25, 2026

## Delivered
- One browser session read/subscription for all mounted account consumers, with race protection and a session-free SSR snapshot.
- Thirty-second reuse for identity/role/preview-scoped dashboard and student lookups; mutation invalidations still refresh saved changes immediately.
- One shared identity/role/date-scoped wellbeing query for the navigation badge, wellbeing page and class Pulse snapshot. The shell owns the existing one-minute poll.
- Feedback cache separated by account, role, preview mode and student context.
- Parallel dashboard to-do dependency reads, complete pagination and bounded ID chunks (150 IDs, at most three parallel chunk reads per list).
- Coalesced derived-read refresh when grades, submissions, coursework or rosters change.
- No grading formulas, draft/posted visibility, server authorization, database policies or security gates changed.

## Measured verification
Temporary administrator session, Chromium, localhost, identical dashboard → wellbeing → dashboard navigation:

| Metric | Before | After |
|---|---:|---:|
| Observed Data API/server-function requests | 59 | 49 |
| Wellbeing server-function requests | 3 | 1 |
| Unread-message requests | 3 | 1 |
| Announcement requests | 2 | 1 |
| Runtime exceptions | 0 | 0 |

Total requests decreased by approximately 17%. Complete chunked to-do loading increases some grade requests intentionally, rather than silently truncating school-wide counts. These are request-count measurements, not a controlled latency benchmark. Source screenshots and measurement JSON were inspected in temporary browser artifacts; no student data was changed or notification sent.

All 168 regression tests pass, including session races, SSR isolation, cross-view cache separation, immediate mutation invalidation and bounded complete reads. Preview compilation reports OK. Student/guardian cache separation was tested in unit tests, not independently walked through under those roles in this update.

## Remaining concerns
Historical database telemetry shows expensive attendance, grade and submission reads. No speculative indexes or access-policy changes were applied; role-specific execution-plan investigation is a separate follow-up.

The previously reported security findings remain unresolved. Performance caching is not an authorization fix. Prioritize verified school-email provisioning, account linking/reset boundaries, cross-class grading and wellbeing access, redirects and notification recipients before describing the app as secure.