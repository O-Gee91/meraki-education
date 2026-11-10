# Two-factor authentication (2FA)

## Where it lives
- **Settings page**: new "Two-step verification" card next to "Change password". Off: short explanation + "Set up authenticator". On: enrolled date, backup codes remaining, "Regenerate backup codes", "Turn off".
- **Sign-in page**: after a correct password, if the account has 2FA, the card switches to "Enter the 6-digit code from your authenticator app", with links "Use a backup code", "Email me a code", and "Cancel".
- **People page (admins)**: a "2FA: On / Off" badge per staff member and a "Reset 2FA" action. Admins never see secrets or codes.

## Flows
1. **Enable**: Scan QR (plus copyable key) → enter first code to confirm → 8 single-use backup codes shown, Copy / Download, must tick "I saved these" to finish.
2. **Login**: password → code prompt → dashboard. Existing username/email login and role routing unchanged. Accounts without 2FA see no change.
3. **Recovery**: backup code (single use), or a 6-digit code emailed to the school address (10 min expiry, 5 tries). After recovery, user is prompted to set up the authenticator again.
4. **Disable**: requires a current authenticator code; removes the factor and all backup codes.
5. **Admin reset**: admin clears a locked-out staff member's 2FA; the person gets an email telling them it was reset.

## Policy
- Opt-in for everyone; encouraged (gentle, dismissible note on Settings) for teachers and admins. Students are never forced.

## Technical details
- TOTP via built-in Auth MFA (`mfa.enroll`, `challenge`, `verify`, `getAuthenticatorAssuranceLevel`). Secrets stay in the auth system.
- Protected layout: if `nextLevel === 'aal2'` and current is `aal1`, send to `/auth` code step.
- New table `mfa_backup_codes` (user_id, code_hash SHA-256, used_at) and `mfa_email_codes` (user_id, code_hash, expires_at, attempts); RLS: no direct client access, only server functions.
- Backup/email recovery: server function verifies hash, marks used, then uses admin API to remove the TOTP factor so the user can sign in at aal1 and re-enroll (Auth has no way to mint aal2 from custom codes).
- Admin status: SECURITY DEFINER function `staff_mfa_status()` returning user_id + boolean, admin-only check via existing role helper.
- Admin reset and email codes via server functions with `requireSupabaseAuth`; email through existing branded sender.
- Tests: backup-code hashing/single-use, email code expiry/attempt limit.
