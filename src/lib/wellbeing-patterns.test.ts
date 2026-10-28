import { describe, expect, it } from "vitest";
import { followUpReason, moodTrendLabel } from "./wellbeing-patterns";

const s = "s1";
describe("followUpReason", () => {
  it("flags two low check-ins in a row", () => {
    expect(
      followUpReason(
        [
          { studentId: s, mood: 2, date: "2026-10-27" },
          { studentId: s, mood: 1, date: "2026-10-28" },
        ],
        "2026-10-28",
      ),
    ).toBe("Two low check-ins in a row");
  });
  it("does not flag a single low day", () => {
    expect(
      followUpReason(
        [
          { studentId: s, mood: 4, date: "2026-10-27" },
          { studentId: s, mood: 1, date: "2026-10-28" },
        ],
        "2026-10-28",
      ),
    ).toBeNull();
  });
  it("flags three low days within a week", () => {
    expect(
      followUpReason(
        [
          { studentId: s, mood: 2, date: "2026-10-22" },
          { studentId: s, mood: 4, date: "2026-10-23" },
          { studentId: s, mood: 1, date: "2026-10-25" },
          { studentId: s, mood: 4, date: "2026-10-26" },
          { studentId: s, mood: 2, date: "2026-10-27" },
          { studentId: s, mood: 5, date: "2026-10-28" },
        ],
        "2026-10-28",
      ),
    ).toBe("Several low check-ins this week");
  });
});

describe("moodTrendLabel", () => {
  it("uses calm wording", () => {
    expect(moodTrendLabel(4.2)).toBe("Mostly positive");
    expect(moodTrendLabel(3)).toBe("Steady");
    expect(moodTrendLabel(2)).toBe("Some support may help");
    expect(moodTrendLabel(null)).toBe("No check-ins yet");
  });
});
