/**
 * Discussion helpers: a tiny, safe formatting language for prompts/replies and
 * per-post scoring math. Formatting is parsed into tokens (never raw HTML).
 *
 * Syntax: **bold**, *italic*, lines starting with "# " are large text,
 * lines starting with "- " are bullet items.
 */

export type InlineToken = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { kind: "large"; parts: InlineToken[] }
  | { kind: "bullet"; parts: InlineToken[] }
  | { kind: "text"; parts: InlineToken[] };

export function parseInline(line: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2], italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

export function parseFormatted(src: string): Block[] {
  return src.split("\n").map((line) => {
    if (line.startsWith("# ")) return { kind: "large", parts: parseInline(line.slice(2)) };
    if (line.startsWith("- ")) return { kind: "bullet", parts: parseInline(line.slice(2)) };
    return { kind: "text", parts: parseInline(line) };
  });
}

/** Wrap the selection [start,end) of `value` with a marker, e.g. "**". */
export function wrapSelection(value: string, start: number, end: number, marker: string) {
  const sel = value.slice(start, end) || "text";
  const next = value.slice(0, start) + marker + sel + marker + value.slice(end);
  return { value: next, cursorStart: start + marker.length, cursorEnd: start + marker.length + sel.length };
}

/** Toggle a line prefix ("# " or "- ") on the line containing `pos`. */
export function toggleLinePrefix(value: string, pos: number, prefix: string) {
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const has = value.startsWith(prefix, lineStart);
  const next = has
    ? value.slice(0, lineStart) + value.slice(lineStart + prefix.length)
    : value.slice(0, lineStart) + prefix + value.slice(lineStart);
  return { value: next, cursor: has ? pos - prefix.length : pos + prefix.length };
}

/** Total discussion points = main response + required replies × reply points. */
export function discussionTotalPossible(responsePoints: number, replyPoints: number, requiredReplies: number) {
  return Math.max(0, responsePoints) + Math.max(0, replyPoints) * Math.max(0, requiredReplies);
}

/** Sum a student's per-post scores; null when nothing is graded yet. */
export function studentDiscussionTotal(scores: { points: number }[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((s, x) => s + (Number(x.points) || 0), 0);
}

export function formatPoints(earned: number | null | undefined, possible: number) {
  return `${earned ?? "—"} / ${possible}`;
}
