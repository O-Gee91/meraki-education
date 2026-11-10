import { describe, expect, it } from "vitest";
import { generateBackupCode, hashCode, isEmailCodeUsable, normalizeCode } from "./mfa-codes";

const now = new Date("2026-11-10T05:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("mfa codes", () => {
  it("backup codes look like XXXX-XXXX", () => {
    expect(generateBackupCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it("hash ignores case, spaces and dashes", async () => {
    expect(await hashCode("a4f2 89b1")).toBe(await hashCode("A4F2-89B1"));
    expect(normalizeCode("a4f2-89b1")).toBe("A4F289B1");
  });
  it("different codes hash differently", async () => {
    expect(await hashCode("AAAA-AAAA")).not.toBe(await hashCode("AAAA-AAAB"));
  });
  it("email code expires after its time", () => {
    expect(isEmailCodeUsable({ expires_at: later(-1000), attempts: 0, used_at: null }, now)).toBe(false);
    expect(isEmailCodeUsable({ expires_at: later(60_000), attempts: 0, used_at: null }, now)).toBe(true);
  });
  it("email code locks after 5 tries", () => {
    expect(isEmailCodeUsable({ expires_at: later(60_000), attempts: 5, used_at: null }, now)).toBe(false);
    expect(isEmailCodeUsable({ expires_at: later(60_000), attempts: 4, used_at: null }, now)).toBe(true);
  });
  it("used email code cannot be reused", () => {
    expect(isEmailCodeUsable({ expires_at: later(60_000), attempts: 0, used_at: now.toISOString() }, now)).toBe(false);
  });
});
