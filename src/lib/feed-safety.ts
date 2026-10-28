/** Shared guardrails for class/group feeds and discussion threads. */
export const POST_MAX_LENGTH = 2000;
export const REPLY_MAX_LENGTH = 1000;

/** Only http(s) links may be shared; returns a normalised link plus host for display. */
export function safeLink(raw: string | null | undefined): { href: string; host: string } | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return { href: url.toString(), host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** Pinned items first (newest first within each group). */
export function splitPinned<T extends { pinned: boolean }>(items: T[]) {
  return { pinned: items.filter((i) => i.pinned), recent: items.filter((i) => !i.pinned) };
}
