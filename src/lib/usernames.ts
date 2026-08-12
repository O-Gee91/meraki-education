/**
 * Usernames are the credential students and guardians use to sign in.
 * Supabase Auth always needs an email address, so we derive a deterministic
 * internal address from the normalized username. Nothing is ever sent to it.
 */
export const USERNAME_EMAIL_DOMAIN = "meraki.local";

export const USERNAME_RULES =
  "3–30 characters: letters, numbers, dots, dashes or underscores.";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(normalizeUsername(value));
}

export function usernameToEmail(value: string): string {
  return `${normalizeUsername(value)}@${USERNAME_EMAIL_DOMAIN}`;
}

/** True when the identifier the person typed looks like an email address. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Accepts either a username or an email and returns the auth email to use. */
export function identifierToEmail(value: string): string {
  const raw = value.trim();
  return looksLikeEmail(raw) ? raw.toLowerCase() : usernameToEmail(raw);
}

export function suggestUsername(first: string, last: string): string {
  const base = `${first}.${last}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 24);
  return base.length >= 3 ? base : `${base}student`.slice(0, 24);
}

export function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `Mk-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}
