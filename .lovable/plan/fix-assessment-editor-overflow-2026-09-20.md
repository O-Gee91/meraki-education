# Fix assessment editor overflow

## Goal
Keep teacher assessment forms usable on desktop, tablet, and phone, with all fields reachable and save actions always visible.

## What will change
- Constrain the New Assessment and Edit Assessment dialogs to the available viewport height.
- Split each dialog into a fixed title, independently scrollable form area, and fixed action footer.
- Make two-column form groups stack on narrow screens so fields do not overflow horizontally.
- Preserve all existing assessment fields, autosave, reopening options, and save/create behavior.
- Verify the dialogs at common desktop and mobile sizes and confirm the preview remains healthy.

## Technical details
- Update only the assessment creation/editing presentation in `AssessmentsTab`.
- Use dynamic viewport height constraints with safe outer spacing and `min-h-0` on the scroll region.
- Keep action buttons inside a bordered footer that remains visible while the form scrolls.
