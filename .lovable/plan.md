# Redesign the Notebook Check grading workspace

## Goal
Replace the narrow grading dialog with a near-fullscreen workspace that makes the roster fast to scan and keeps one student's grading details visible at a time.

## What will change
- Expand the grading view to the viewport with a clear Close control and a sticky assignment header.
- Show assignment progress in the header: collected count, scored count, roster total, and current student position.
- Keep bulk tools visible while the roster scrolls: top quick scores, blank-only option, collected selection, filter, return, and clear actions.
- Use a two-pane desktop layout:
  - Left: searchable roster with compact striped rows, checkboxes, status, inline score, and quick-score actions.
  - Right: selected student details with submission text/file, score controls, rubric, proofreading, and comments.
- Add jump-to-student search, Previous/Next controls, and keyboard navigation with Up/Down and Enter-to-save behavior.
- On phones and narrow tablets, show the roster first and open the selected student in a dedicated detail view with a Back control.
- Preserve selection across scrolling and filtering; “Select all collected” continues to apply only to the currently visible roster and will not auto-select newly collected work.

## Technical details
- Refactor only the staff grading portion of the existing assignment work component; preserve current data queries, mutations, quick-score editing, collection, return, rubric, and proofreading behavior.
- Track the active student independently from bulk-selected rows.
- Use the existing design-system buttons, inputs, badges, checkboxes, and semantic color tokens.
- Validate desktop and mobile layouts, keyboard controls, build health, and the existing bulk-action behavior.
