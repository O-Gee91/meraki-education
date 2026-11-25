import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { evaluateFeatureFlags } from "@/lib/feature-flags.functions";
import { featureEnabled, FEATURE_FLAG_STALE_TIME, type FeatureContext } from "@/lib/feature-flags";

export function useFeatureFlag(key: string, context: FeatureContext = {}) {
  const { user, primaryRole, previewingStudent } = useAuth();
  const evaluate = useServerFn(evaluateFeatureFlags);
  const query = useQuery({
    queryKey: ["feature-flags", user?.id, primaryRole, previewingStudent, context.assignmentId ?? null, context.submissionId ?? null],
    queryFn: () => evaluate({ data: context }),
    enabled: Boolean(user) && !previewingStudent,
    staleTime: FEATURE_FLAG_STALE_TIME,
    refetchInterval: FEATURE_FLAG_STALE_TIME,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  return !previewingStudent && Boolean(user) && featureEnabled(query.data, key);
}