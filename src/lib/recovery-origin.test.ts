import { describe, expect, it } from "vitest";
import { recoveryOrigin } from "./recovery-origin";

describe("password recovery return address", () => {
  it("allows the primary and www school addresses over HTTPS", () => {
    expect(recoveryOrigin("https://meraki-education.app")).toBe("https://meraki-education.app");
    expect(recoveryOrigin("https://www.meraki-education.app")).toBe("https://www.meraki-education.app");
  });
  it("allows this project's published and preview addresses", () => {
    expect(recoveryOrigin("https://meraki-education.lovable.app")).toBe("https://meraki-education.lovable.app");
    expect(recoveryOrigin("https://id-preview--507de411-a4a4-440c-8cab-4d1940138dd1.lovable.app")).toBe("https://id-preview--507de411-a4a4-440c-8cab-4d1940138dd1.lovable.app");
  });
  it("rejects an unrelated site, including another app on the shared hosting domain", () => {
    expect(recoveryOrigin("https://attacker.example")).toBeNull();
    expect(recoveryOrigin("https://other-app.lovable.app")).toBeNull();
    expect(recoveryOrigin("https://meraki-education.app.attacker.example")).toBeNull();
  });
  it("rejects insecure public origins and embedded credentials or paths", () => {
    expect(recoveryOrigin("http://meraki-education.app")).toBeNull();
    expect(recoveryOrigin("https://person@meraki-education.app")).toBeNull();
    expect(recoveryOrigin("https://meraki-education.app/external")).toBeNull();
  });
  it("allows local development without allowing arbitrary local-looking hosts", () => {
    expect(recoveryOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(recoveryOrigin("http://localhost.attacker.example:8080")).toBeNull();
  });
});