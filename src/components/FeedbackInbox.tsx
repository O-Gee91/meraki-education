import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/school";
import { useStudentPreviewId } from "@/hooks/useStudentPreview";
import { listMyFeedback, type FeedbackItem } from "@/lib/feedback.functions";
import { useAuth } from "@/hooks/useAuth";
import { feedbackKey, READ_REUSE_MS } from "@/lib/api-query-policy";

const SEEN_KEY = "meraki.feedback-seen";

const KIND_LABEL: Record<FeedbackItem["kind"], string> = {
  grade: "Comment with your score",
  note: "Comment on your work",
  mark: "Proofreading mark",
  rubric: "Rubric feedback",
  answer: "Question feedback",
};

/** Teacher feedback from every class, in one place a student actually checks. */
export function useMyFeedback(enabled: boolean, previewStudentId?: string | null) {
  const load = useServerFn(listMyFeedback);
  const { user, primaryRole, previewingStudent, loading } = useAuth();
  return useQuery({
    queryKey: feedbackKey(user?.id, primaryRole, previewingStudent, previewStudentId),
    enabled: enabled && Boolean(user) && !loading,
    staleTime: READ_REUSE_MS,
    queryFn: () => load({ data: { previewStudentId: previewStudentId ?? null } }),
  });
}

/** Count of feedback written since the student last opened the list. */
export function useUnreadFeedback(items: FeedbackItem[]) {
  const [seenAt, setSeenAt] = useState<number>(0);
  useEffect(() => {
    setSeenAt(Number(window.localStorage.getItem(SEEN_KEY) ?? 0));
  }, []);
  const unread = useMemo(
    () => items.filter((i) => Date.parse(i.at) > seenAt).length,
    [items, seenAt],
  );
  const markSeen = () => {
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    setSeenAt(now);
  };
  return { unread, seenAt, markSeen };
}

export function FeedbackInbox({ classId }: { classId?: string }) {
  const previewStudentId = useStudentPreviewId();
  const { data = [], isLoading } = useMyFeedback(true, previewStudentId);
  const items = classId ? data.filter((i) => i.classId === classId) : data;
  const { unread, seenAt, markSeen } = useUnreadFeedback(items);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-4 text-accent" />
          Feedback from your teachers
          {unread > 0 ? <Badge className="ml-1">{unread} new</Badge> : null}
        </h2>
        {unread > 0 ? (
          <Button size="sm" variant="outline" onClick={markSeen}>
            Mark as read
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every comment your teachers have written on your assignments and assessments.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your feedback…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No written feedback yet — it will appear here as soon as a teacher comments on your work.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {shown.map((item) => {
              const isNew = Date.parse(item.at) > seenAt;
              return (
                <li
                  key={item.id}
                  className={`rounded-xl border p-3 ${
                    isNew ? "border-accent/50 bg-accent/5" : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {item.title}
                      {item.studentName ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {item.studentName}
                        </span>
                      ) : null}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {item.className} · {formatDate(item.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[item.kind]}
                    {isNew ? " · new" : ""}
                  </p>
                  {item.subtitle ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">{item.subtitle}</p>
                  ) : null}
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{item.body}</p>
                </li>
              );
            })}
          </ul>
          {items.length > 5 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : `Show all ${items.length}`}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
