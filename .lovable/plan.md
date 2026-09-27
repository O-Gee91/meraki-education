# Calm Gradebook and Consistent Student Overall Grade

## Goal
Make the Gradebook quieter and easier to scan in teacher and student views, while ensuring the Overview grade uses the same grading rules as each class Gradebook.

## Changes
- Apply the selected “Subtle tonal ledger” direction to the existing Gradebook matrix without changing its structure or workflows.
- Reduce colored surface area, heavy shadows, strong borders, striping, and oversized status emphasis.
- Keep semantic color as restrained text, dots, and badges so proficiency, missing, excused, and ungraded states remain accessible at a glance.
- Preserve the teacher’s sticky student column, filters, sorting, reports, scrolling, and the student’s compact single-row view.
- Replace Overview’s current “10 most recent numeric scores” calculation with the same `computeAverage` rules used by the class Gradebook.
- Include all available grade records, category weighting, special marks, and extra credit in the Overview calculation.
- Calculate each class through its own grading setup, then show the mean of the student’s available class averages as the school-wide Overview grade; with one class, it will exactly match that class’s Gradebook.
- Keep Recent scores limited to the ten latest numeric results without limiting the overall calculation.

## Validation
- Compare the Overview value with the class Gradebook for the signed-in student and confirm an exact match when only one class has a calculated grade.
- Confirm Missing, Excused, weighted categories, and extra credit use the same behavior on both screens.
- Check the Gradebook visually in teacher and student modes at desktop and mobile widths.
- Confirm the app builds without errors.

## Technical details
- Reuse `computeAverage`, `parseGradingSetup`, and `letterFor` from the shared grading module rather than introducing another formula.
- Keep presentation changes scoped to the Gradebook ledger in `src/routes/_authenticated/classes.$classId.tsx`.
- Update the Overview query in `src/routes/_authenticated/dashboard.tsx` to load the fields required by the shared calculation, while slicing only the Recent scores display.
