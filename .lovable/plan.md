# Well-being teacher responses

## What will change
- Let teachers view and respond to check-ins from any student in a grade they teach, while admins retain school-wide access.
- Make saved follow-ups readable by the student who submitted the check-in.
- Record the responding teacher on new and edited follow-ups, and display their name with the response.
- Keep the existing **Add/Edit follow-up** teacher workflow; students receive a clear **Teacher response** section and cannot edit it.
- Preserve historical follow-ups; older entries without a recorded responder will show a neutral school-team label.

## Technical details
- Update row-level permissions only for Well-being check-ins and responses, using the existing grade-teaching permission function.
- Save the signed-in teacher ID in the existing responder field and load matching profile names.
- Keep one editable follow-up per check-in, matching the current data model.

## Verification
- Check teacher, admin, and student visibility rules.
- Confirm responder names and student read-only responses render correctly.
- Confirm the project build succeeds.
