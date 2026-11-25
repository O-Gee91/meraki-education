import { describe, expect, it, vi } from "vitest";
import { featureEnabled, FEATURE_FLAG_STALE_TIME } from "./feature-flags";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { suggestFeedback } from "./feedback-ai.functions";
import { updateFeatureFlag, listFeatureFlags } from "./feature-flags.functions";

const suggest = suggestFeedback as unknown as (input: unknown) => Promise<{ suggestion: string; error: string | null }>;
const update = updateFeatureFlag as unknown as (input: unknown) => Promise<unknown>;
const list = listFeatureFlags as unknown as (input: unknown) => Promise<unknown>;

describe("feature switches", () => {
  it("defaults unknown flags to off", () => expect(featureEnabled([{ key: "other", enabled: true }], "ai_feedback_suggestions")).toBe(false));
  it("defaults unloaded flags to off", () => expect(featureEnabled(undefined, "ai_feedback_suggestions")).toBe(false));
  it("honors a disabled flag", () => expect(featureEnabled([{ key: "ai_feedback_suggestions", enabled: false }], "ai_feedback_suggestions")).toBe(false));
  it("honors an enabled flag", () => expect(featureEnabled([{ key: "ai_feedback_suggestions", enabled: true }], "ai_feedback_suggestions")).toBe(true));
  it("keeps the availability cache to one minute", () => expect(FEATURE_FLAG_STALE_TIME).toBe(60_000));

  it("rejects non-admin changes before touching rollout records", async () => {
    const from = vi.fn();
    await expect(update({ data: {}, context: { supabase: { rpc: async () => ({ data: false, error: null }), from } } })).rejects.toThrow("Administrator access required");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects non-admin rollout-list reads", async () => {
    const from = vi.fn();
    await expect(list({ context: { supabase: { rpc: async () => ({ data: false, error: null }), from } } })).rejects.toThrow("Administrator access required");
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects nonstaff AI calls even with an enabled switch", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(suggest({ data: {}, context: { supabase: { rpc } } })).rejects.toThrow("Only teachers and admins");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rechecks a switched-off feature at the AI send boundary", async () => {
    const rpc = vi.fn(async (name: string) => name === "is_staff" ? { data: true, error: null } : { data: [{ key: "ai_feedback_suggestions", enabled: false }], error: null });
    const result = await suggest({ data: { assignmentId: "assignment-1" }, context: { supabase: { rpc } } });
    expect(result.suggestion).toBe("");
    expect(result.error).toContain("not enabled");
    expect(rpc).toHaveBeenCalledWith("evaluated_feature_flags", { _assignment_id: "assignment-1" });
  });
  it("does not call AI when evaluation fails", async () => {
    const rpc = vi.fn(async (name: string) => name === "is_staff" ? { data: true, error: null } : { data: null, error: { message: "offline" } });
    const result = await suggest({ data: { submissionId: "submission-1" }, context: { supabase: { rpc } } });
    expect(result.suggestion).toBe("");
    expect(result.error).toContain("not enabled");
    expect(rpc).toHaveBeenCalledWith("evaluated_feature_flags", { _submission_id: "submission-1" });
  });
});