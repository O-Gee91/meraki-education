# Apply the Coursework Design to Gradebook

## Goal
Bring the same compact, scalable Meraki coursework design into the class Gradebook so large rosters and many assignments remain easy to scan and edit.

## Changes
- Replace the current plain grade table container with the Academic Teal ledger treatment already used in Coursework.
- Add a compact Gradebook header with assignment and student counts, the existing remembered student sort control, and quick-score controls.
- Add a category rail on wide screens and a category selector on smaller screens so teachers can narrow visible grade columns without losing scores.
- Keep student names and averages visible while scrolling, with the grade grid scrolling independently in both directions.
- Make assignment headers compact and readable with title, category, points, and existing fill-blanks/fill-all actions.
- Improve row scanability with restrained striping, clearer score cells, and category/progress accents while preserving the existing theme choices.
- Preserve all current grade editing, quick scores, special marks, averages, student privacy labels, student sorting, and student-facing read-only behavior.

## Validation
- Verify score editing and quick-fill actions still target the correct student and assignment after filtering and sorting.
- Check the Gradebook at desktop and mobile widths for readable controls, sticky labels, and usable horizontal scrolling.
- Confirm the app builds without errors.

## Technical details
- Limit changes to the class Gradebook presentation and local view state in `src/routes/_authenticated/classes.$classId.tsx`, reusing existing semantic coursework tokens from the design system.
- Keep all operations keyed by student and assignment IDs so layout, sorting, and filtering cannot alter saved data.
