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

export function FeedbackInbox({ classId, desktopReview = false }: { classId?: string; desktopReview?: boolean }) {
  const previewStudentId = useStudentPreviewId();
  const { data = [], isLoading } = useMyFeedback(true, previewStudentId);
  const items = classId ? data.filter((i) => i.classId === classId) : data;
  const { unread, seenAt, markSeen } = useUnreadFeedback(items);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <section className={desktopReview ? "border-t border-border pt-6" : "panel mt-6 p-5"}>
      <div className="grid min-w-0 gap-3 sm:flex sm:items-center sm:justify-between">
        <h2 className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-4 shrink-0 text-accent" />
          <span>Feedback from your teachers</span>
          {unread > 0 ? <Badge className="shrink-0">{unread} new</Badge> : null}
        </h2>
        {unread > 0 ? (
          <Button size="sm" variant="outline" className="min-h-11 justify-self-start" onClick={markSeen}>
            Mark as read
          </Button>
        ) : null}
      </div>
      {!desktopReview && <p className="mt-1 text-sm text-muted-foreground">
        Every comment your teachers have written on your assignments and assessments.
      </p>}

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
                  className={`${desktopReview ? "border-b py-4" : "rounded-xl border p-3"} ${
                    isNew ? "border-accent/50 bg-accent/5" : "border-border bg-muted/30"
                  }`}
                >
                  <div className="grid min-w-0 gap-2 sm:flex sm:items-center sm:justify-between">
                    <p className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {item.title}
                      {item.studentName ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {item.studentName}
                        </span>
                      ) : null}
                    </p>
                    <span className="min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {item.className} · {formatDate(item.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[item.kind]}
                    {isNew ? " · new" : ""}
                  </p>
                  {item.subtitle ? (
                    <p className="mt-1 break-words text-xs italic text-muted-foreground [overflow-wrap:anywhere]">{item.subtitle}</p>
                  ) : null}
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{item.body}</p>
                </li>
              );
            })}
          </ul>
          {items.length > 5 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 min-h-11"
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
