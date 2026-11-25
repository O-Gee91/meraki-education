import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { feedbackKey, READ_REUSE_MS, wellbeingFeedKey } from "./api-query-policy";

describe("scoped read reuse", () => {
  it("reuses a wellbeing read for badge, page and snapshot until explicitly invalidated", async () => {
    const client = new QueryClient();
    const read = vi.fn(async () => [{ id: "checkin" }]);
    const options = { queryKey: wellbeingFeedKey("u1", "teacher", true), queryFn: read, staleTime: READ_REUSE_MS };
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    await client.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ["checkins"] });
    await client.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(2);
    client.clear();
  });
  it("keeps wellbeing identities, staff hats and date filters separate", () => {
    const keys = [wellbeingFeedKey("u1", "teacher", true), wellbeingFeedKey("u2", "teacher", true), wellbeingFeedKey("u1", "admin", false), wellbeingFeedKey("u1", "teacher", true, "2026-11-25")];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
  });
  it("never reuses family feedback across accounts or student-preview contexts", () => {
    const keys = [feedbackKey("u1", "student", false), feedbackKey("u2", "student", false), feedbackKey("u1", "parent", false), feedbackKey("u1", "student", true, "s1"), feedbackKey("u1", "student", true, "s2")];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(5);
  });
});