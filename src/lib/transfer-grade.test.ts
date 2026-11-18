import { describe, expect, it } from "vitest";
import { transferPoints, TRANSFER_POINTS } from "./transfer-grade";

describe("transfer grade", () => {
  it("carries the old percentage as points out of 100", () => {
    expect(TRANSFER_POINTS).toBe(100);
    expect(transferPoints(86.6666)).toBe(86.7);
  });
  it("skips students with no old grade", () => {
    expect(transferPoints(null)).toBeNull();
  });
});
