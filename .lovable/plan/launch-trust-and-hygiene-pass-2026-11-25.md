# Launch trust and hygiene pass

No changes to grades, attendance, roles or data-access rules.

## 1. Privacy and Terms pages
- Step 1: I draft the Privacy Policy and Terms copy in chat for your approval before publishing. Covers: what student, guardian and teacher data is kept; who sees what by role (students/guardians only see posted grades; check-ins private); retention; security (encryption in transit, 2FA/passkeys, access limits); service providers (hosting/database, email sender, AI feedback assistant, Lovable visitor analytics); contact; school-use terms, accounts, acceptable use, limitations.
- I will need from you: the contact email and the school/operator name. No certifications or legal compliance claims unless you supply them.
- Step 2: new public pages `/privacy` and `/terms`, calm Meraki styling.
- Links in a small shared footer (home, sign-in, forgot-password, reset pages) and under the sign-in form.

## 2. Search and sharing
- Homepage and sign-in page get their own clear title and description; Privacy, Terms, Forgot password get their own too.
- Replace the default icon with a Meraki mark (generated, square), remove the old icon file.
- A 1200x630 sharing image for the homepage only.
- `sitemap.xml` listing only `/`, `/auth`, `/privacy`, `/terms`.
- robots.txt: allow `/`, `/auth`, `/privacy`, `/terms`; keep everything else blocked; add the sitemap line.

## 3. Not-found page
- Branded page: short calm message, "Go home" and "Sign in" buttons (Dashboard if already signed in).

## 4. Security report (report only, in chat)
- Already confirmed: security headers present (HSTS, CSP with nonce, frame blocking, nosniff, referrer and permissions policy); no private keys found in browser code.
- Will check: HTTPS redirect on live domains, headers on the live site, forgot/reset password pages open and send correctly.
- Note: no built-in sign-in rate limiting beyond the sign-in service's own limits; listed as a known gap, not built.

## Technical details
- Routes: `src/routes/privacy.tsx`, `terms.tsx`, `sitemap[.]xml.ts` server route with fixed list; `SiteFooter` component; edit `auth.tsx`, `index.tsx`, `forgot-password.tsx` heads; `__root.tsx` favicon link + NotFoundComponent.
- Canonical/og:url per leaf on https://meraki-education.app; og:image only on index.
- Visitor analytics description follows current publish settings (read before writing).
