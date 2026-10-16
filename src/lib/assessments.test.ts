import { describe, expect, it } from "vitest";
import { seededOrder } from "./assessments";

describe("seededOrder", () => {
  it("is stable for the same student so a refresh keeps the order", () => {
    expect(seededOrder(5, "a:s1:q1")).toEqual(seededOrder(5, "a:s1:q1"));
  });
  it("is a permutation of every original choice", () => {
    expect([...seededOrder(6, "x")].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("gives different students different orders", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => seededOrder(4, `a:s${i}:q1`).join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
