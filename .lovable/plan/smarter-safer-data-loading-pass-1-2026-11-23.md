# Smarter, safer data loading (pass 1)

## What the audit found
- Most screens load whole tables at once. Only ~10 places in the app limit how many rows they load; class pages, grading, discussions, reports and the calendar load everything.
- The database returns at most 1000 rows per request. Big class gradebooks, school-wide reports and discussion boards can quietly stop at 1000 rows without any warning. This is the biggest risk.
- The same filters (missing, turned in, needs grading, graded, due window) are rebuilt by hand on each screen.
- Deleting a discussion post removes it for good (an audit copy is kept). There is no "hidden by moderator" state.
- There are no outside or partner endpoints today, so no versioning work is needed yet.

## What this pass builds (highest impact first)
1. **Shared list helper**: one way to load lists with page and page size, total count, a "load more" option, and only the columns each list needs. Large loads fetch in pages, so nothing stops at 1000.
2. **Shared coursework status filters**: missing / turned in / needs grading / graded, due window, class, student, date range. They are built on the existing missing-work and status rules, so counts stay the same.
3. **Assignments hub and class Coursework**: use the shared filters, with paged loading for long lists.
4. **Gradebook grades, attendance history, check-ins and audit logs**: load in pages so nothing is cut off silently. Grade math is untouched.
5. **Discussion posts**: paged loading ("Show more responses") plus a soft delete (deleted_at, deleted_by). A deleted post shows as "Post removed" in its thread, so replies still make sense. Admins can still see the original through the audit log. Students and guardians never see the removed text.

## What stays the same
- Access rules for every role, draft vs posted grades, private wellbeing notes, grade calculations, status rules, page layouts (except a "Show more" button where lists are paged).

## Left for a later pass
- Versioned partner endpoints, if any are ever added.
- Paged loading for messages, behavior log, calendar and the community feed.

## Technical details
- `src/lib/query.ts`: `fetchPage({ table, select, filters, page, limit })` → `{ rows, total, nextPage }` using `.range()` with `count: "exact"`; `fetchAll()` loops `.range()` for aggregates that must see every row (gradebook, reports, missing counts).
- `src/lib/coursework-filters.ts`: typed filter object + `applyCourseworkFilter()` built on `isMissingWork` / `resolveWorkState`; Vitest coverage for each status.
- Migration: `discussion_posts.deleted_at`, `deleted_by`. Update the SELECT policy so non-staff get the body replaced (through a view or RPC `discussion_posts_visible`). Change delete to an UPDATE, and keep the audit trigger recording `action='soft_delete'`. Completion and scoring ignore deleted posts.
- Swap unbounded `.select()` calls in classes.$classId, AssignmentWork, DiscussionBoard, reports, PrintTemplates and wellbeing.functions to `fetchAll`/`fetchPage`.
- Tests: pagination concatenation, filter results matching the existing missing counts, soft-deleted post excluded from completion.
