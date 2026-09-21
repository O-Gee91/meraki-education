# Fix missing Well-being updates

## What I found
- The check-ins are still stored: there are entries from today’s recent period and many previous days.
- The page currently builds a large student-ID filter in the browser, while database access separately applies teacher/class rules. If those two scopes disagree or the scope is still loading, the page can return an empty list without showing an error.
- Data-loading errors are currently hidden behind the same “No check-ins recorded yet” message.

## Changes
1. Move the Well-being feed lookup into one authenticated server function that applies the signed-in user’s role and class/grade access consistently.
2. Return check-ins, student names, staff responses, and responder names together, removing the fragile multi-query browser filtering path.
3. Keep administrators school-wide, teachers limited to their assigned grades/classes, and students/parents limited to their linked records.
4. Show a real loading state and an actionable error instead of incorrectly saying there are no updates.
5. Preserve the date filter, current response controls, and existing check-in form.

## Validation
- Confirm the feed returns both recent and older records for a teacher with assigned classes.
- Confirm students cannot see another student’s entries.
- Check the Well-being page at desktop and mobile widths and verify the project build remains healthy.
