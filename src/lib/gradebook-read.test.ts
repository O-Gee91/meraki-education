import { describe, expect, it } from "vitest";
import { gradebookReadGate, showsEmptyGradebook } from "./gradebook-read";

const ready = {
  roster: "success",
  assignments: "success",
  grades: "success",
  submissions: "success",
} as const;

describe("gradebook reads fail closed", () => {
  it("hides the empty-class prompt while the roster or assignments are still loading", () => {
    expect(
      gradebookReadGate({ ...ready, roster: "pending", grades: "idle", submissions: "idle" }),
    ).toBe("loading");
    expect(
      gradebookReadGate({ ...ready, assignments: "pending", grades: "idle", submissions: "idle" }),
    ).toBe("loading");
    expect(showsEmptyGradebook("loading", 0, 0)).toBe(false);
  });

  it("hides the empty-class prompt when the roster or assignments fail", () => {
    expect(
      gradebookReadGate({ ...ready, roster: "error", grades: "idle", submissions: "idle" }),
    ).toBe("error");
    expect(
      gradebookReadGate({ ...ready, assignments: "error", grades: "idle", submissions: "idle" }),
    ).toBe("error");
    expect(showsEmptyGradebook("error", 0, 0)).toBe(false);
  });

  it("still fails closed when grades or submissions fail after the lists succeed", () => {
    expect(gradebookReadGate({ ...ready, grades: "error" })).toBe("error");
    expect(gradebookReadGate({ ...ready, submissions: "pending" })).toBe("loading");
  });

  it("shows the empty-class prompt only after a successful read of an empty list", () => {
    expect(gradebookReadGate({ ...ready, grades: "idle", submissions: "idle" })).toBe("ready");
    expect(showsEmptyGradebook("ready", 0, 3)).toBe(true);
    expect(showsEmptyGradebook("ready", 4, 0)).toBe(true);
    expect(showsEmptyGradebook("ready", 4, 3)).toBe(false);
  });
});
