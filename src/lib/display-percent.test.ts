import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE, letterFor, roundPercent } from "./grading";
import { gradeTone } from "./school";

describe("letter and tone after one-decimal rounding", () => {
  it("treats 70.0 and 69.95 as C, and 80.0 as B", () => {
    expect(roundPercent(70)).toBe(70);
    expect(roundPercent(69.95)).toBe(70);
    expect(roundPercent(80)).toBe(80);
    expect(roundPercent(79.95)).toBe(80);
    expect(letterFor(70, DEFAULT_SCALE)).toBe("C");
    expect(letterFor(69.95, DEFAULT_SCALE)).toBe("C");
    expect(letterFor(80, DEFAULT_SCALE)).toBe("B");
    expect(letterFor(79.95, DEFAULT_SCALE)).toBe("B");
    expect(gradeTone(69.95)).toBe("text-warning");
    expect(gradeTone(70)).toBe("text-warning");
    expect(gradeTone(79.95)).toBe("text-success");
    expect(gradeTone(80)).toBe("text-success");
  });
});
