import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("sign-in return paths", () => {
  it.each(["//evil.example", "/\\evil.example", "/%5cevil.example", "/%255cevil.example", "/%2fevil.example", "/\nevil.example", "https://evil.example", "/%zz"])("rejects unsafe destination %s", (path) => {
    expect(safeNext(path)).toBeUndefined();
  });
  it("preserves a local class destination with search and hash", () => {
    expect(safeNext("/classes/123?tab=coursework#work")).toBe("/classes/123?tab=coursework#work");
  });
});