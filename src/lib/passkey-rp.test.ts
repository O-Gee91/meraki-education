import { describe, expect, it } from "vitest";
import { guessDeviceName, resolveRelyingParty } from "./passkey-rp";

describe("resolveRelyingParty", () => {
  it("shares one party across the apex and www domain", () => {
    expect(resolveRelyingParty("https://www.meraki-education.app")?.rpID).toBe("meraki-education.app");
    expect(resolveRelyingParty("https://meraki-education.app")?.rpID).toBe("meraki-education.app");
  });
  it("uses the exact lovable host", () => {
    expect(resolveRelyingParty("https://meraki-education.lovable.app")?.rpID).toBe("meraki-education.lovable.app");
  });
  it("allows localhost over http", () => {
    expect(resolveRelyingParty("http://localhost:8080")).toEqual({ rpID: "localhost", origin: "http://localhost:8080" });
  });
  it("rejects unknown or insecure sites", () => {
    expect(resolveRelyingParty("https://evil.example.com")).toBeNull();
    expect(resolveRelyingParty("http://meraki-education.app")).toBeNull();
    expect(resolveRelyingParty(null)).toBeNull();
  });
  it("labels devices", () => {
    expect(guessDeviceName("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows computer");
  });
});
