# Smoother data loading across Meraki

## Findings (current state)
- Hard caps still in place: Messages (150 messages / 30 threads), Behavior log (500), Community feed (10), Class feed (50), Wellbeing feed server read (1000), Pulse (200), Attendance history (50), class page side list (20).
- No live updates exist today: the database has no tables enabled for realtime. Teachers see changes via polling (wellbeing feed, app shell, calendar) or on navigation.
- A shared refresh coordinator (`read-refresh.ts`) already batches related refreshes after edits, but it does not cover wellbeing, behavior, or attendance-to-class views.

## What changes for users
1. **"Show more" on long lists** — Messages, Behavior log, Community feed, Class feed and Wellbeing feed load the newest page first, with a calm "Show older" button. Nothing is hidden permanently anymore; totals and counts are unaffected.
2. **Faster class page / Gradebook / Pulse** — confirm each loads only that class's rows, in parallel, reusing the shared cached reads (keyed by viewer + active role + preview). Remove any duplicate fetches found.
3. **Near-live teacher updates** — when a grade, attendance mark or wellbeing check-in changes, open teacher screens for that class refresh within a second or two, instead of waiting for polling.
4. **Quicker refresh after edits** — saving grades, attendance, behavior or wellbeing responses refreshes every dependent tile (Today snapshot, Pulse, gradebook averages, missing counts) once.

## Safety
- No RLS, draft/posted, or permission changes. Live updates carry **no data** — only a "something changed" signal on a private, permission-checked class channel; screens then refetch through the existing protected reads.
- Counts, averages and missing work keep using full reads (`fetchAll`); paging applies only to display lists, never to anything that feeds a calculation.
- Polling stays as a fallback.

## Technical details
- New `src/lib/paged.ts` helper: keyset paging by `(created_at, id)` with `useInfiniteQuery`; query keys include viewer/role/preview. Applied to messages.tsx, behavior.tsx, community.tsx, ClassFeed.tsx, and the wellbeing feed server function (cursor + page size input, same authorization).
- Migration: `SECURITY DEFINER` statement-level triggers on `grades`, `attendance`, `wellbeing_checkins` (and staff notes) that call `realtime.send` with `private := true` on topic `class:<class_id>` (once per distinct class per statement); `realtime.messages` SELECT policy allowing a topic only when `can_manage_class(class_id)` is true. Students/guardians never subscribe.
- `useClassDoorbell(classId)` hook (in `useEffect`, unique cleanup, refetch on reconnect) invalidates class-scoped keys, throttled to one refetch per burst. Used by class page, Gradebook, Pulse.
- Extend `read-refresh.ts` with wellbeing, behavior and attendance groups.
- Audit class page/Gradebook/Pulse queries for waterfalls; parallelize with bounded ID chunks per existing rule.
- Tests: paging cursor helper, read-refresh new groups, doorbell throttling. Run full suite (currently 217) before finishing. Record rules in AGENTS.md.

## Not changed
Grading math, posted-only visibility, wellbeing privacy, student/guardian views' data scope.
