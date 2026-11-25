/** A return path must survive browser URL parsing without changing origin. */
export function safeNext(next?: string): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(next)) return undefined;
  try {
    // Reject encoded separators/control characters too, including double encoding.
    let decoded = next;
    for (let i = 0; i < 3; i++) {
      const value = decodeURIComponent(decoded);
      if (/[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return undefined;
      if (value === decoded) break;
      decoded = value;
    }
    const base = "https://return-path.invalid";
    const url = new URL(next, base);
    if (url.origin !== base || url.username || url.password) return undefined;
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}