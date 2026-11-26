import { describe, expect, it } from "vitest";
import { hasMorePages, nextPageLimit } from "./paged";

describe("progressive list paging", () => {
  it("grows by one step and stops at the ceiling", () => {
    expect(nextPageLimit(50, 50)).toBe(100);
    expect(nextPageLimit(980, 50)).toBe(1000);
  });
  it("offers more only when the page came back full", () => {
    expect(hasMorePages(50, 50)).toBe(true);
    expect(hasMorePages(49, 50)).toBe(false);
    expect(hasMorePages(1000, 1000)).toBe(false);
  });
});
