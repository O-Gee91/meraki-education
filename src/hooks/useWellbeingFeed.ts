import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { listWellbeingFeed } from "@/lib/wellbeing.functions";
import { LIVE_REFRESH_MS, READ_REUSE_MS, wellbeingFeedKey } from "@/lib/api-query-policy";

/** Badge, full feed and class snapshot reuse the same identity/hat-scoped read. */
export function useWellbeingFeed(date = "", enabled = true, poll = false) {
  const { user, primaryRole, teacherMode, previewingStudent, loading } = useAuth();
  const load = useServerFn(listWellbeingFeed);
  return useQuery({
    queryKey: wellbeingFeedKey(user?.id, primaryRole, teacherMode, date),
    enabled: enabled && Boolean(user) && !loading && !previewingStudent,
    queryFn: () => load({ data: date ? { date, teacherMode } : { teacherMode } }),
    staleTime: READ_REUSE_MS,
    refetchInterval: poll ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}