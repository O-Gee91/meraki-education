# Simplified Gradebook Assignment List

## Goal
Replace the wide student-score grid in the Gradebook with a compact assignment list that shows assignment-level information only.

## Changes
- Show one row per assignment with assignment name, category, due date, and class average percentage.
- Calculate each class average from recorded numeric grades for that assignment; excluded/special marks and unscored students will not lower the average.
- Add category filtering and due-date filtering.
- Add instant sorting by assignment name, category, due date, or class average, including ascending/descending direction.
- Keep the existing Pulse section and all underlying grade records unchanged.
- Remove student search, student sorting, quick-score controls, and individual score cells from the Gradebook view only; grading remains available through Coursework.

## Validation
- Verify empty/ungraded assignments display a clear unavailable average.
- Verify filters and sorting work together on desktop and mobile.
- Confirm the app builds successfully.
