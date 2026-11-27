import { describe, expect, it } from "vitest";
import { applyClassScope } from "./dashboard-upcoming";

describe("dashboard upcoming scope", () => {
  it("applies the teacher's class ids before the row limit", async () => {
    const calls: string[] = [];
    const query = {
      in(column: "class_id", values: string[]) {
        calls.push(`${column}:${values.join(",")}`);
        return query;
      },
      limit(count: number) {
        calls.push(`limit:${count}`);
        return Promise.resolve({ data: [{ id: "kept" }], error: null });
      },
    };
    const result = await applyClassScope(query, new Set(["class-b", "class-a"]), 15);
    expect(calls).toEqual(["class_id:class-b,class-a", "limit:15"]);
    expect(result.data).toEqual([{ id: "kept" }]);
  });

  it("returns an empty page when the teacher has no classes", async () => {
    const query = {
      in() {
        throw new Error("class filter should not run");
      },
      limit() {
        throw new Error("limit should not run");
      },
    };
    await expect(applyClassScope(query, new Set(), 15)).resolves.toEqual({ data: [], error: null });
  });

  it("leaves an unscoped admin query limited to the whole school", async () => {
    const calls: string[] = [];
    const query = {
      in() {
        throw new Error("admin mode does not filter classes");
      },
      limit(count: number) {
        calls.push(`limit:${count}`);
        return Promise.resolve({ data: [], error: null });
      },
    };
    await applyClassScope(query, null, 15);
    expect(calls).toEqual(["limit:15"]);
  });
});
