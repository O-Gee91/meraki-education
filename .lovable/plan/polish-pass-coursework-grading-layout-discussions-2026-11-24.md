# Polish pass: coursework, grading, layout, discussions

## What already works (confirmed in code)
1. Coursework: Current / Past-Graded / All tabs, search, and a "Due soon / Needs attention" strip exist. Upcoming was removed on Nov 17 at your request. Categories are not collapsible yet.
2. Grading: the main check-in & score window has one close button. Other grading windows have not been rechecked since.
3. Layout: fixes went into class pages, the gradebook, grading and the calendar. None were checked at real tablet width while signed in.
4. Discussions: main post + required replies already counts as turned in. Partial work after the due date shows Missing.
5. Deleting a post keeps the original. Teachers have a deleted-posts log. There is no admin-only page across the school.

## Changes
1. **Coursework**
   - Bring back the Upcoming tab: work that opens or is due more than 7 days out. Current stays the default.
   - Group by category in sections that open and close, with a count on each. Sections with current work start open.
   - Keep the summary strip, search and status wording.
2. **Grading windows**
   - Use one close button ("X Close") in every grading window: discussion grading, rubric scoring, proofreading, the student report and the gradebook cell.
   - Remove repeated hints and labels, extra borders and duplicate buttons.
   - Keep score, points possible, comment, status, student name and history. Grade math stays the same.
3. **Layout**
   - Check class pages, Coursework, the gradebook, discussions and the Assignments hub at 768, 1024 and 1280 px wide.
   - Fix anything that gets cut off or forces scrolling sideways.
4. **Discussion status**
   - Show "Submitted" or "Needs grading" for anyone who met the post and reply requirements, even after the due date. Show "Missing" only when they did not.
   - Show turned-in status and graded status as two separate labels.
   - Add tests for both cases.
5. **Admin moderation page**
   - Add a new admin-only page called "Discussion moderation".
   - List every removed post and reply with the original text, author, who removed it, when it was posted and when it was removed. Filter by class and date.
   - Normal views keep hiding removed content.

## Technical notes
- Coursework: re-add the `upcoming` key in `coursework-view.ts` and update its tests. Use the Collapsible component in `classes.$classId.tsx`.
- Closing: use `hideClose` plus a header button, or the default X alone. Never show both.
- Status: base it on `resolveDiscussionState` and `withDiscussionSubmissions`, and add tests.
- Moderation page: `src/routes/_authenticated/admin.moderation.tsx`. Reads `discussion_post_audits`, where only admins can read. Check the read access before building, and add an admin-only policy if needed. Look up names through `profiles`.
- No database changes unless that read access is missing.
