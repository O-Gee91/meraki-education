import { beforeEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; payload: unknown }[] = [];

function row(table: string, select: string) {
  if (table === "assessment_answers" && select === "submission_id") {
    return { submission_id: "sub-1" };
  }
  if (table === "assessment_submissions" && select === "assessment_id") {
    return { assessment_id: "assessment-1" };
  }
  if (table === "assessments" && select === "class_id") return { class_id: "class-1" };
  if (table === "assessment_answers" && select.includes("assessment_questions(points)")) {
    return { submission_id: "sub-1", assessment_questions: { points: 5 } };
  }
  if (table === "assessment_answers" && select.includes("points_awarded")) {
    return null;
  }
  if (table === "assessment_submissions" && select.includes("auto_score")) {
    return { auto_score: 8, total_points: 10, assessment_id: "assessment-1" };
  }
  if (table === "assessments" && select === "assignment_id") {
    return { assignment_id: "assignment-1" };
  }
  if (table === "assignments") return { points_possible: 10, category: "Test" };
  return null;
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let select = "";
      const api = {
        select: (columns: string) => {
          select = columns;
          return api;
        },
        eq: () => api,
        maybeSingle: async () => ({ data: row(table, select), error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
          const data =
            table === "assessment_answers" && select.includes("points_awarded")
              ? [
                  {
                    id: "answer-1",
                    points_awarded: null,
                    assessment_questions: { kind: "essay", answer_key: {} },
                  },
                ]
              : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
        update: (payload: unknown) => {
          writes.push({ table, payload });
          return {
            eq: async () => ({ error: { message: "stop after the write was attempted" } }),
          };
        },
      };
      return api;
    },
  },
}));

import { scoreEssayAnswer } from "./assessments.functions";

const score = scoreEssayAnswer as unknown as (input: {
  data: { answerId: string; points: number };
  context: { supabase: { rpc: (name: string) => Promise<{ data: boolean }> } };
}) => Promise<unknown>;

const context = {
  supabase: { rpc: async () => ({ data: true }) },
};

beforeEach(() => {
  writes.length = 0;
});

describe("scoreEssayAnswer server enforcement", () => {
  it("rejects a question score above its points before writing", async () => {
    await expect(
      score({ data: { answerId: "answer-1", points: 8 }, context }),
    ).rejects.toThrow("Score cannot be higher than 5, the total for this question.");
    expect(writes).toEqual([]);
  });

  it("rejects a gradebook total above the assignment before writing", async () => {
    await expect(
      score({ data: { answerId: "answer-1", points: 5 }, context }),
    ).rejects.toThrow("Score cannot be higher than 10, the total for this assessment.");
    expect(writes).toEqual([]);
  });
});
