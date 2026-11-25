import { describe, expect, it, vi } from "vitest";
import { createSharedSessionStore } from "./shared-session";

function harness() {
  let onSession: ((session: string | null) => void) | undefined;
  let resolveRead: ((session: string | null) => void) | undefined;
  const stop = vi.fn();
  const read = vi.fn(() => new Promise<string | null>((resolve) => { resolveRead = resolve; }));
  const listen = vi.fn((listener: (session: string | null) => void) => { onSession = listener; return stop; });
  const store = createSharedSessionStore({ read, listen });
  return { store, read, listen, stop, emit: (s: string | null) => onSession?.(s), resolve: (s: string | null) => resolveRead?.(s) };
}

describe("shared browser session", () => {
  it("uses one read and subscription for twenty auth consumers", async () => {
    const h = harness();
    const unsub = Array.from({ length: 20 }, () => h.store.subscribe(vi.fn()));
    h.resolve("teacher");
    await Promise.resolve();
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.listen).toHaveBeenCalledTimes(1);
    expect(h.store.getSnapshot()).toEqual({ session: "teacher", loading: false });
    unsub.forEach((stop) => stop());
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
  it("does not let an older initial read restore a signed-out session", async () => {
    const h = harness();
    const unsub = h.store.subscribe(vi.fn());
    h.emit(null);
    h.resolve("old-admin");
    await Promise.resolve();
    expect(h.store.getSnapshot()).toEqual({ session: null, loading: false });
    unsub();
  });
  it("never exposes a browser session through its SSR snapshot", () => {
    const h = harness();
    const unsub = h.store.subscribe(vi.fn());
    h.emit("admin");
    expect(h.store.getServerSnapshot()).toEqual({ session: null, loading: true });
    unsub();
  });
  it("clears state and ignores a pending read after the final consumer leaves", async () => {
    const h = harness();
    const unsub = h.store.subscribe(vi.fn());
    unsub();
    h.resolve("admin");
    await Promise.resolve();
    expect(h.store.getSnapshot()).toEqual({ session: null, loading: true });
  });
});