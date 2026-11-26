import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addDays,
  agendaDates,
  calendarMarkKind,
  inSwipeWindow,
  monthContainsDay,
  partitionAgenda,
} from "./notebook-calendar";
import { aboveTrackNote, checklistSteps } from "./notebook-notes";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sketch = readFileSync(new URL("../components/Sketch.tsx", import.meta.url), "utf8");
const fonts = readFileSync(new URL("../components/NotebookStyle.tsx", import.meta.url), "utf8");

describe("notebook calendar presentation", () => {
  it("maps kinds without changing the underlying row", () => {
    expect(calendarMarkKind({ source: "work", kind: "assignment" })).toBe("assignment");
    expect(calendarMarkKind({ source: "work", kind: "discussion" })).toBe("assignment");
    expect(calendarMarkKind({ source: "event", category: "deadline" })).toBe("reminder");
    expect(calendarMarkKind({ source: "event", category: "exam" })).toBe("assignment");
    expect(calendarMarkKind({ source: "event", category: "holiday" })).toBe("event");
  });

  it("swipes today through the next seven days and folds earlier dates", () => {
    expect(addDays("2026-11-26", 7)).toBe("2026-12-03");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(inSwipeWindow("2026-11-26", "2026-11-26")).toBe(true);
    expect(inSwipeWindow("2026-12-03", "2026-11-26")).toBe(true);
    expect(inSwipeWindow("2026-12-04", "2026-11-26")).toBe(false);
    expect(inSwipeWindow("2026-11-25", "2026-11-26")).toBe(false);
    const rows = [
      { id: "a", date: "2026-11-20" },
      { id: "b", date: "2026-11-26" },
      { id: "c", date: "2026-11-28" },
    ];
    expect(partitionAgenda(rows, "2026-11-26")).toEqual({
      earlier: [{ id: "a", date: "2026-11-20" }],
      ahead: [
        { id: "b", date: "2026-11-26" },
        { id: "c", date: "2026-11-28" },
      ],
    });
    expect(agendaDates(partitionAgenda(rows, "2026-11-26").earlier)).toEqual(["2026-11-20"]);
    expect(monthContainsDay("2026-11-26", "2026-11-01", "2026-11-30")).toBe(true);
    expect(monthContainsDay("2026-12-01", "2026-11-01", "2026-11-30")).toBe(false);
  });
});

describe("notebook margin notes and checklist", () => {
  it("annotates an average that is already above the on-track line", () => {
    expect(aboveTrackNote(null)).toBeNull();
    expect(aboveTrackNote(Number.NaN)).toBeNull();
    expect(aboveTrackNote(79.9)).toBeNull();
    expect(aboveTrackNote(80)).toBeNull();
    expect(aboveTrackNote(83.24)).toBe("+3.2% above the on-track line");
    expect(aboveTrackNote(83.24)).not.toContain("83.2%");
  });

  it("ticks only the steps that have finished", () => {
    expect(checklistSteps(["Assignments and assessments", "Submissions and grades"], 0)).toEqual([
      { label: "Assignments and assessments", done: false },
      { label: "Submissions and grades", done: false },
    ]);
    expect(checklistSteps(["Assignments and assessments", "Submissions and grades"], 1)[0]?.done).toBe(true);
    expect(checklistSteps(["Assignments and assessments", "Submissions and grades"], 1)[1]?.done).toBe(false);
    expect(checklistSteps(["Assignments and assessments", "Submissions and grades"], 2).every((step) => step.done)).toBe(true);
  });
});

describe("notebook visual rules", () => {
  it("keeps chalk, motion and print decorations off the reading text", () => {
    expect(sketch).toContain('aria-hidden="true"');
    expect(sketch).toContain("sketch-dark");
    expect(sketch).toContain("feDisplacementMap");
    expect(css).toContain(".notebook-data");
    expect(css).toContain("font-family: var(--font-sans)");
    expect(css).toContain(".notebook-chip");
    expect(css).toContain(".notebook-swipe-event");
    expect(css).toContain(".style-notebook.dark .notebook-day[aria-current=\"date\"] .notebook-day-number { background: none; }");
    expect(css).toContain(".notebook-complete-rule");
    expect(css).toContain(".notebook-cork");
    expect(css).toContain(".notebook-detention-slip");
    expect(css).toContain(".notebook-strike-slip");
    expect(css).toContain(".notebook-margin-note");
    expect(css).toContain(".notebook-draft");
    expect(css).toContain("notebook-fly");
    expect(css).toContain("transform: none !important");
    expect(css).toContain(".notebook-stamp");
    expect(fonts).toContain("ZCOOL+KuaiLe");
    expect(fonts).toContain("Recursive:CASL");
    expect(fonts).toContain('style !== "notebook"');
  });
});
