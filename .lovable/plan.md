# Behavior log: categorized reasons + plagiarism zero

## What changes

**Type stays the top-level action** — Positive, Concern, Strike (counts toward detention). Existing "Incident" entries keep working but the option is retired from the new-note picker.

**Strike requires a reason** (dropdown appears once Strike is picked):
Plagiarism · Cheating / Academic Dishonesty · Disruptive Behavior · Disrespect (peers or staff) · Inappropriate Language · Not Following Instructions · Off-Task / Not Working · Physical Aggression / Contact · Other

**Concern gets sub-categories:** Academic · Behavioral · Social / Emotional · Other

"Other" shows the free-text note as the explanation; the note field stays available for every reason.

**Plagiarism handling:** when Plagiarism is the strike reason, the teacher can pick one of that student's class assignments and tick "Mark this assignment zero". Saving writes a 0 score for that student on that assignment, so the gradebook, student report, and printed reports all show 0. The log entry reads: `Strike — Plagiarism — Essay 2 (0)`.

**Display:** the badge row on every note shows the reason next to the type, in the grade-wide log, in a student's own log, and in the strike tracker. Editing a note lets staff change type, reason, date, and note.

## Technical notes

- Migration adds to `public.behavior_notes`: `reason text`, `assignment_id uuid references public.assignments(id) on delete set null`, and `scored_zero boolean not null default false`. No RLS/grant changes needed (existing policies cover the table); indexes not required at this volume.
- Zero score is written with the same `grades` upsert shape used elsewhere (`onConflict: "assignment_id,student_id"`, `points_earned: 0`, comment noting plagiarism), then `["grades"]` / `["behavior"]` queries are invalidated so every gradebook view syncs.
- Assignment options for the dropdown come from the student's `enrollments` → `assignments` for classes the teacher can see.
- Reason label helpers live in a small `src/lib/behavior-reasons.ts` so the form, log rows, and strike tracker share one source.
- Form validation: Strike and Concern both require a reason before saving; Plagiarism + "mark zero" requires an assignment.
