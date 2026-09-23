# Prevent grading comments from disappearing

## Goal
Keep teacher-written comments intact while scores, rubrics, students, and grading views change.

## What will change
- Preserve the latest stored comment when a score or assessment status is updated, instead of replacing it with an empty or automatic note.
- Autosave unfinished rubric comments per student and restore them when the teacher returns.
- Keep each student's rubric editor isolated so switching students cannot briefly reuse or overwrite another student's comment.
- Protect assessment feedback and proofreading comments from being lost when the grading view closes or refreshes.
- Keep existing scoring, special marks, rubrics, and student feedback visibility unchanged.

## Technical details
- Make score-only writes update score fields without rewriting genuine comment fields; special marks remain the only score action allowed to replace a mark code.
- Prevent automatic assessment synchronization notes from overwriting genuine teacher comments.
- Add draft-state handling and dirty-state hydration guards to comment editors.
- Verify assignment, rubric, assessment, and proofreading comment flows plus build health.
