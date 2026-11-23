import { describe, expect, it } from "vitest";
import { chunk, fetchAll, fetchPage } from "./query";
import { applyCourseworkFilter } from "./coursework-filters";

const source = Array.from({ length: 2345 }, (_, i) => i);
const build = (from: number, to: number) =>
  Promise.resolve({ data: source.slice(from, to + 1), error: null, count: source.length });

describe("fetchAll", () => {
  it("loads past the 1000-row cap", async () => {
    const rows = await fetchAll(build);
    expect(rows.length).toBe(2345);
    expect(rows[2344]).toBe(2344);
  });
  it("throws on error", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: { message: "nope" } }))).rejects.toThrow("nope");
  });
});

describe("fetchPage", () => {
  it("returns total and next page", async () => {
    const p = await fetchPage(build, 3, 1000);
    expect(p.rows.length).toBe(345);
    expect(p.total).toBe(2345);
    expect(p.nextPage).toBeNull();
    expect((await fetchPage(build, 1, 50)).nextPage).toBe(2);
  });
});

it("chunk splits id lists", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

describe("applyCourseworkFilter", () => {
  const rows = [
    { id: "a", state: "missing" as const, dueDate: "2026-11-10" },
    { id: "b", state: "turned_in" as const, dueDate: "2026-11-20" },
    { id: "c", state: "graded" as const, dueDate: "2026-11-25" },
    { id: "d", state: "collected" as const, dueDate: null },
  ];
  it("missing keeps only missing", () => expect(applyCourseworkFilter(rows, { status: "missing" }).map((r) => r.id)).toEqual(["a"]));
  it("needs grading keeps turned in and collected", () =>
    expect(applyCourseworkFilter(rows, { status: "needs_grading" }).map((r) => r.id)).toEqual(["b", "d"]));
  it("graded keeps graded", () => expect(applyCourseworkFilter(rows, { status: "graded" }).map((r) => r.id)).toEqual(["c"]));
  it("due window is inclusive", () =>
    expect(applyCourseworkFilter(rows, { dueFrom: "2026-11-20", dueTo: "2026-11-25" }).map((r) => r.id)).toEqual(["b", "c"]));
});
