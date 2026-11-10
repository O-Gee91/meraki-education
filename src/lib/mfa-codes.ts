/** Pure helpers for 2FA backup and email codes (safe on server and client). */

export const BACKUP_CODE_COUNT = 8;
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

// No 0/O/1/I to avoid misreading.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomIndexes(n: number, mod: number): number[] {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => v % mod);
}

/** Format: XXXX-XXXX */
export function generateBackupCode(): string {
  const chars = randomIndexes(8, ALPHABET.length).map((i) => ALPHABET[i]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function generateEmailCode(): string {
  return randomIndexes(6, 10).join("");
}

/** Uppercase, strip spaces/dashes so "a4f2 89b1" matches "A4F2-89B1". */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeCode(code));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface EmailCodeRow {
  expires_at: string;
  attempts: number;
  used_at: string | null;
}

/** An email code can be tried only while unused, unexpired, and under the attempt limit. */
export function isEmailCodeUsable(row: EmailCodeRow, now: Date = new Date()): boolean {
  if (row.used_at) return false;
  if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return false;
  return new Date(row.expires_at).getTime() > now.getTime();
}
