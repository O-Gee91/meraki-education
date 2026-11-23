import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/school";

/** Opens the Discussion board tab on the class page. */
export function openDiscussionBoard() {
  window.dispatchEvent(new CustomEvent("meraki:open-class-tab", { detail: "discussions" }));
}

/** Finds the discussion linked to a gradebook assignment (if any). */
export function useLinkedDiscussion(assignmentId: string) {
  return useQuery({
    queryKey: ["assignment-discussion", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("id, thread_id, title")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function OpenDiscussionButton({ label = "Open on Discussion Board" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openDiscussionBoard}>
      <MessagesSquare className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

/** Shows one student's discussion posts and replies inside the Coursework grading view. */
export function DiscussionWorkPreview({
  discussion,
  studentId,
}: {
  discussion: { id: string; thread_id: string | null };
  studentId: string;
}) {
  const threadId = discussion.thread_id ?? discussion.id;
  const { data, isLoading } = useQuery({
    queryKey: ["discussion-posts", "coursework-preview", threadId, studentId],
    queryFn: async () => {
      const { data: student, error: sErr } = await supabase
        .from("students")
        .select("user_id")
        .eq("id", studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!student?.user_id) return [];
      const { data: posts, error } = await supabase
        .from("discussion_posts")
        .select("id, parent_id, body, created_at")
        .eq("discussion_id", threadId)
        .eq("author_id", student.user_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return posts ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading discussion posts…</p>;
  const posts = data ?? [];
  const roots = posts.filter((p) => !p.parent_id).length;
  const replies = posts.length - roots;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {roots} {roots === 1 ? "post" : "posts"} · {replies} {replies === 1 ? "reply" : "replies"}
        </p>
        <OpenDiscussionButton label="Score on Discussion Board" />
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No discussion posts from this student yet.</p>
      ) : (
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {posts.map((p) => (
            <div key={p.id} className="border-l-2 border-primary pl-4">
              <p className="text-xs font-medium text-muted-foreground">
                {p.parent_id ? "Reply" : "Post"} · {formatDateTime(p.created_at)}
              </p>
              <p className="whitespace-pre-wrap text-base leading-7">{p.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
