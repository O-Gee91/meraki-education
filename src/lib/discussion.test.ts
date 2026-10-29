import { describe, expect, it } from "vitest";
import { discussionTotalPossible, formatPoints, parseFormatted, studentDiscussionTotal, wrapSelection } from "./discussion";

describe("discussion scoring", () => {
  it("total possible is response points plus required replies times reply points", () => {
    expect(discussionTotalPossible(6, 2, 2)).toBe(10);
  });
  it("sums individual post and reply scores", () => {
    expect(studentDiscussionTotal([{ points: 5 }, { points: 2 }, { points: 1.5 }])).toBe(8.5);
  });
  it("is ungraded when no posts have scores", () => {
    expect(studentDiscussionTotal([])).toBeNull();
  });
  it("shows points as earned / possible", () => {
    expect(formatPoints(8, 10)).toBe("8 / 10");
  });
});

describe("discussion formatting", () => {
  it("parses bold, italic, large and bullet lines", () => {
    const b = parseFormatted("# Title\n- **bold** and *it*");
    expect(b[0]).toEqual({ kind: "large", parts: [{ text: "Title" }] });
    expect(b[1]?.kind).toBe("bullet");
    expect(b[1]?.parts).toEqual([{ text: "bold", bold: true }, { text: " and " }, { text: "it", italic: true }]);
  });
  it("wraps the selected text with a marker", () => {
    expect(wrapSelection("hello world", 6, 11, "**").value).toBe("hello **world**");
  });
});
