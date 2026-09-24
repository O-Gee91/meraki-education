# Fix Missing status in the grading roster

## Changes
- Detect the saved `M` special mark before the general graded-state check.
- Show `Collected · Missing` in roster rows instead of `Graded` when the work is explicitly collected.
- Use a warning icon and accessible warning styling so Missing is distinguishable without color alone.
- Keep scores, comments, collection records, bulk actions, and other special marks unchanged.

## Verification
- Confirm an `M` grade renders as Missing and a numeric score still renders as Graded.
- Confirm the app builds successfully.
