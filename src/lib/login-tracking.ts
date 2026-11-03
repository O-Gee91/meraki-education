/**
 * Sign-ins are now recorded by the database itself whenever the sign-in
 * service authenticates a user, so no app or third-party client can skip it.
 * Kept as a no-op so existing callers keep working.
 */
export async function recordLogin(): Promise<void> {}
