import { describe, expect, it } from "vitest";
import { countNewCheckins } from "./wellbeing-badge";

const now = new Date("2026-10-28T12:00:00Z");

describe("countNewCheckins", () => {
  it("counts unresponded check-ins after last seen", () => {
    const items = [
      { createdAt: "2026-10-28T11:00:00Z", responses: [] },
      { createdAt: "2026-10-28T09:00:00Z", responses: [] },
    ];
    expect(countNewCheckins(items, "2026-10-28T10:00:00Z", now)).toBe(1);
  });
  it("ignores check-ins a staff member already responded to", () => {
    expect(countNewCheckins([{ createdAt: "2026-10-28T11:00:00Z", responses: [{}] }], null, now)).toBe(0);
  });
  it("ignores check-ins older than 7 days when never seen", () => {
    expect(countNewCheckins([{ createdAt: "2026-10-20T11:00:00Z", responses: [] }], null, now)).toBe(0);
  });
});
