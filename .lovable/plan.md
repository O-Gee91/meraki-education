# Consistent student sorting across the app

## Goal
Give teachers the same predictable student order everywhere, with an easy per-view control that remembers its last setting.

## What will change
- Add one shared student-name sorting utility with four choices: Last name A–Z, Last name Z–A, First name A–Z, and First name Z–A.
- Add a compact reusable sort control that clearly shows the current choice and remains usable on mobile.
- Persist each screen’s choice separately in the browser, defaulting to Last name A–Z.
- Apply filtering first and sorting second, while keeping selections keyed by student ID so sorting never changes selected students.

## Views covered
- Class gradebook, class roster, and student-add picker
- Coursework grading and the fullscreen Notebook Check workspace
- Assessment submissions and grading
- Attendance
- Pulse and missing-work student lists
- Schoolwide Students directory and account-linking picker
- Behavior student picker
- Well-being student picker and staff check-in list
- Report-card lists, student portfolio picker, and printable roster-based reports
- Any other student dropdown or roster discovered during the final audit

## Sorting rules
- Trim surrounding whitespace and compare with `Intl.Collator` using locale-aware, case-insensitive, accent-insensitive, natural numeric ordering.
- Keep apostrophes, hyphens, and multi-word names intact; do not split or reinterpret recorded family names.
- Use the other name field as the tiebreaker, then the stable student ID for duplicate full names.
- Put missing selected-name fields after named students in either direction.
- Treat a one-name record by whichever stored field contains that name; no guessed name parsing.

## Validation
- Verify the shared comparator with focused cases for accents, apostrophes, hyphens, whitespace, numbers, missing names, and duplicates.
- Check that filtering precedes sorting and selected IDs remain unchanged in bulk grading and roster actions.
- Run type and build checks, then inspect representative desktop and mobile teacher views when authenticated access permits.

## Technical details
- Create a shared utility/hook and reusable control rather than duplicating comparators and storage logic.
- Keep persistence client-safe and hydration-safe.
- Do not change database records, permissions, or grading behavior.
