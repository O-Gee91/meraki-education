import { describe, expect, it } from "vitest";
import { resolveWorkState } from "./coursework-state";

const base = { score: null, missing: false, pastDue: false };

describe("resolveWorkState", () => {
  it("collected but ungraded is never 'Not completed' or missing", () => {
    const r = resolveWorkState({ ...base, submissionStatus: "collected", missing: true, pastDue: true });
    expect(r.label).toBe("Collected · needs grading");
  });
  it("saved draft is not handed in", () => {
    expect(resolveWorkState({ ...base, submissionStatus: "draft", missing: true }).state).toBe("missing");
  });
  it("a score wins over submission state", () => {
    expect(resolveWorkState({ ...base, score: 0, submissionStatus: "submitted" }).state).toBe("graded");
  });
  it("special mark label wins over everything", () => {
    expect(resolveWorkState({ ...base, score: 5, markLabel: "Excused" }).label).toBe("Excused");
  });
  it("past due but not auto-flagged stays Assigned", () => {
    expect(resolveWorkState({ ...base, pastDue: true }).state).toBe("assigned");
  });
  it("online assessment submission counts as turned in", () => {
    expect(resolveWorkState({ ...base, handedInElsewhere: true }).state).toBe("turned_in");
  });
});
