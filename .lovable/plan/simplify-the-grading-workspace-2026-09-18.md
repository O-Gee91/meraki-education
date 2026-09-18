# Simplify the grading workspace

## Goal
Make the student roster easier to scan by separating navigation from grading controls and making each student’s identity the strongest element.

## What will change
- Narrow the left side into a dedicated roster with a stronger divider and a roomier right-side grading workspace.
- Remove all repeated quick-score buttons from roster rows; keep quick scoring only in the selected student’s detail panel.
- Redesign each roster row around a larger, bolder student name, with score and status shown as secondary information.
- Replace the prominent “Collected” badge with quieter status text and a small indicator.
- Keep selection checkboxes, inline score entry, search, sorting, bulk selection, return actions, and mobile detail navigation working.
- Reorganize the top controls so class-wide actions are visually separate from roster search and selection controls.

## Technical details
- Refactor only the fullscreen staff grading interface in `AssignmentWork`.
- Preserve all current queries, grading mutations, keyboard navigation, proofing, rubric, attachment, and bulk-action behavior.
- Use the existing Meraki theme tokens and controls, then verify desktop and phone layouts plus build health.
