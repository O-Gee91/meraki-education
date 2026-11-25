# Progressive late penalty for Missing work

## What teachers get
- In each assignment's settings: a "Late penalty" toggle, a "deduct per day late" amount (percent or points), and "becomes 0 after X days late".
- When a student's score is "M" and the penalty is on, the item counts as a shrinking partial score instead of 0, until it reaches 0 after X days.
- In the grading window (not the main grid), a short line explains it, e.g. "3 days late, -15%, counts as 85%" or "6 days late, counts as 0". The gradebook cell shows a small hover tip only.

## The rule (plain language)
- Due day counts as on time. Lateness starts after 11:59 pm on the due date, in the class's time zone.
- Each full day late removes the daily amount from the assignment's full value.
- Once days late reaches X, the item counts as 0. It never goes below 0.
- Excused (EX) and other non-Missing marks are never penalized.
- If the teacher enters a real score, that score replaces Missing as entered. No automatic penalty is applied; teachers adjust by hand if they want. Helper text says this.
- With the penalty off, "M" stays 0 as today.
- Students and families only see posted values; drafts stay hidden as today.

## Where it applies
One shared calculation is used by the gradebook, grading window, student assignment view, reports and printouts, Pulse, and all overall averages, so every screen agrees. Category weighting and transfer grades are unchanged. The Missing label and missing-work counts stay the same (an "M" is still Missing; only its point value changes).

## Technical details
- Migration: add to `assignments` nullable/defaulted columns `late_penalty_enabled boolean default false`, `late_penalty_mode text default 'percent'` (percent|points, check), `late_penalty_per_day numeric`, `late_penalty_zero_after_days integer`. Existing RLS covers them.
- New `src/lib/late-penalty.ts`: `daysLate(dueDate, now, timezone)` and `missingMarkValue(assignment, now)` returning `{ points, daysLate, explanation }`.
- `computeAverage` in `src/lib/grading.ts`: for "M" with `behavior: "zero"` on a penalty-enabled assignment, use `missingMarkValue` points instead of 0; callers already pass assignments, add `now`.
- `isMissingWork` / `resolveWorkState` unchanged.
- UI: settings in the assignment form; explanation in `AssignmentWork.tsx` score panel and gradebook cell tooltip; `StudentClassReport` uses the helper.
- Old `late_penalty_override_pct` on submissions stays untouched.
- Tests `late-penalty.test.ts`: on time, 1 day, X-1, X, beyond X, EX not penalized, penalty off = 0, draft M hidden from student average, points mode, timezone end-of-day.
- Update AGENTS.md with the shared-helper rule.
