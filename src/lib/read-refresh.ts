import type { QueryClient } from "@tanstack/react-query";

const WORK = new Set(["assignments", "assessments", "discussions", "assignment-submissions", "assessment-submissions", "grades", "assignment-grades", "discussion-posts", "posts", "rubric-score"]);
const ROSTER = new Set(["roster", "enrollments", "co-teachers"]);

/** Coalesce related mutation invalidations into one refresh per derived read. */
export function subscribeReadRefresh(client: QueryClient) {
  let pending = new Set<string>();
  let queued = false;
  let alive = true;
  const stop = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "invalidate") return;
    const root = String(event.query.queryKey[0]);
    if (WORK.has(root)) {
      ["teacher-todo", "my-grades", "my-feedback", "upcoming-assignments", "upcoming-assessments"].forEach((key) => pending.add(key));
    }
    if (ROSTER.has(root) || root === "students") {
      ["teacher-todo", "self-students", "teacher-scope", "preview-scope", "calendar-coursework"].forEach((key) => pending.add(key));
    }
    if (root === "co-teachers") pending.add("co-taught-classes");
    if (root === "attendance") ["my-attendance", "pulse-attendance", "teacher-todo"].forEach((key) => pending.add(key));
    if (root === "behavior" || root === "detentions") ["pulse-behavior", "teacher-todo"].forEach((key) => pending.add(key));
    if (root === "checkins") ["teacher-todo"].forEach((key) => pending.add(key));
    if (pending.size === 0 || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const keys = pending;
      pending = new Set();
      if (!alive) return;
      for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
    });
  });
  return () => { alive = false; stop(); };
}