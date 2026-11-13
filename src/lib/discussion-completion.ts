import { supabase } from "@/integrations/supabase/client";
import { meetsDiscussionCriteria } from "@/lib/discussion-state";

/**
 * Discussions store work in discussion posts, not assignment submissions.
 * This finds students who met the post + reply criteria for discussion-linked
 * assignments, so the shared missing rule treats them as turned in.
 * Returns keys of the form `${studentId}:${assignmentId}`.
 */
export async function fetchDiscussionCompletions(assignmentIds: string[], studentIds?: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (assignmentIds.length === 0) return done;
  const { data: discs } = await supabase
    .from("discussions")
    .select("id, thread_id, assignment_id, required_replies")
    .in("assignment_id", assignmentIds);
  if (!discs?.length) return done;
  const threadIds = [...new Set(discs.map((d) => d.thread_id ?? d.id))];
  const { data: posts } = await supabase
    .from("discussion_posts")
    .select("discussion_id, author_id, parent_id")
    .in("discussion_id", threadIds);
  if (!posts?.length) return done;
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  let sq = supabase.from("students").select("id, user_id").in("user_id", authorIds);
  if (studentIds?.length) sq = sq.in("id", studentIds);
  const { data: students } = await sq;
  const studentByUser = new Map((students ?? []).map((s) => [s.user_id, s.id]));
  for (const d of discs) {
    if (!d.assignment_id) continue;
    const tid = d.thread_id ?? d.id;
    const counts = new Map<string, { roots: number; replies: number }>();
    for (const p of posts) {
      if (p.discussion_id !== tid) continue;
      const c = counts.get(p.author_id) ?? { roots: 0, replies: 0 };
      if (p.parent_id) c.replies++;
      else c.roots++;
      counts.set(p.author_id, c);
    }
    for (const [uid, c] of counts) {
      const sid = studentByUser.get(uid);
      if (sid && meetsDiscussionCriteria(c.roots, c.replies, d.required_replies)) done.add(`${sid}:${d.assignment_id}`);
    }
  }
  return done;
}

/** Appends a "submitted" row for each completed discussion that has no submission row yet. */
export async function withDiscussionSubmissions<T extends { assignment_id: string; student_id?: string }>(
  rows: T[],
  assignmentIds: string[],
  studentIds?: string[],
): Promise<T[]> {
  const done = await fetchDiscussionCompletions(assignmentIds, studentIds);
  if (done.size === 0) return rows;
  const have = new Set(rows.map((r) => `${r.student_id}:${r.assignment_id}`));
  const extra: T[] = [];
  for (const key of done) {
    if (have.has(key)) continue;
    const [student_id, assignment_id] = key.split(":");
    if (studentIds?.length === 1 && !rows.some(() => true) && student_id !== studentIds[0]) continue;
    extra.push({ assignment_id, student_id, status: "submitted", submitted_at: null, id: `discussion-${key}` } as unknown as T);
  }
  return [...rows, ...extra];
}
