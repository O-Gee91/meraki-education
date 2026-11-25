export type FeatureContext = { assignmentId?: string; submissionId?: string };
export type EvaluatedFlag = { key: string; enabled: boolean };

/** Unknown flags and failed/unloaded evaluations are off, never permissions. */
export function featureEnabled(flags: readonly EvaluatedFlag[] | undefined, key: string) {
  return flags?.find((flag) => flag.key === key)?.enabled === true;
}

export const FEATURE_FLAG_STALE_TIME = 60_000;