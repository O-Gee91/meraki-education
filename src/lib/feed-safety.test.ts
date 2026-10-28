import { describe, expect, it } from "vitest";
import { safeLink } from "./feed-safety";

describe("safeLink", () => {
  it("accepts https links and shows the host", () => {
    expect(safeLink("https://www.khanacademy.org/math")?.host).toBe("khanacademy.org");
  });
  it("adds https to bare domains", () => {
    expect(safeLink("docs.google.com/doc")?.href).toBe("https://docs.google.com/doc");
  });
  it("rejects javascript links", () => {
    expect(safeLink("javascript:alert(1)")).toBeNull();
  });
  it("rejects data links", () => {
    expect(safeLink("data:text/html,hi")).toBeNull();
  });
  it("rejects empty and non-domain values", () => {
    expect(safeLink("")).toBeNull();
    expect(safeLink("hello")).toBeNull();
  });
});
