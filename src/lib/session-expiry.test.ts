import { describe, expect, it } from "vitest";
import { isExpiredSessionError } from "./session-expiry";

describe("isExpiredSessionError", () => {
  it("recognizes a lapsed Data API session and a server-function auth rejection", () => {
    expect(isExpiredSessionError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isExpiredSessionError(new Error("Unauthorized: Invalid token"))).toBe(true);
    expect(isExpiredSessionError(new Error("Unauthorized: No authorization header provided"))).toBe(true);
  });

  it("leaves ordinary permission and validation failures alone", () => {
    expect(isExpiredSessionError(new Error("You can only manage assessments for your own classes"))).toBe(false);
    expect(isExpiredSessionError(new Error("Forbidden"))).toBe(false);
    expect(isExpiredSessionError(new Error("Invalid input"))).toBe(false);
  });
});
