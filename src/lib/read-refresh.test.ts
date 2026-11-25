import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { subscribeReadRefresh } from "./read-refresh";

describe("derived read refresh", () => {
  it("coalesces grade and submission changes and refreshes both feedback and dashboard totals", async () => {
    const client = new QueryClient();
    const read = vi.fn(async () => 1);
    const options = { queryKey: ["my-grades", "u1"], queryFn: read, staleTime: 30_000 };
    await client.fetchQuery(options);
    client.setQueryData(["assignment-grades", "a1"], []);
    client.setQueryData(["assignment-submissions", "a1"], []);
    client.setQueryData(["my-feedback", "u1"], []);
    client.setQueryData(["teacher-todo", "u1"], []);
    const stop = subscribeReadRefresh(client);
    const invalidations = vi.spyOn(client, "invalidateQueries");
    await Promise.all([
      client.invalidateQueries({ queryKey: ["assignment-grades", "a1"] }),
      client.invalidateQueries({ queryKey: ["assignment-submissions", "a1"] }),
    ]);
    expect(invalidations.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === "my-grades")).toHaveLength(1);
    expect(client.getQueryState(["my-feedback", "u1"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["teacher-todo", "u1"])?.isInvalidated).toBe(true);
    await client.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
    client.clear();
  });
  it("invalidates student lookups when the roster changes without an invalidation loop", async () => {
    const client = new QueryClient();
    client.setQueryData(["roster", "c1"], []);
    client.setQueryData(["self-students", "u1"], []);
    const stop = subscribeReadRefresh(client);
    await client.invalidateQueries({ queryKey: ["roster"] });
    expect(client.getQueryState(["self-students", "u1"])?.isInvalidated).toBe(true);
    stop();
    client.clear();
  });
});