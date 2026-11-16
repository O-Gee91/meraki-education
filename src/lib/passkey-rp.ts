/** Works out the passkey "relying party" for the site the person is on. */
export function resolveRelyingParty(origin: string | null | undefined): { rpID: string; origin: string } | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return { rpID: "localhost", origin: url.origin };
  if (url.protocol !== "https:") return null;
  if (host === "meraki-education.app" || host === "www.meraki-education.app") {
    return { rpID: "meraki-education.app", origin: url.origin };
  }
  // lovable.app is a shared domain, so each preview/published host is its own party.
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return { rpID: host, origin: url.origin };
  return null;
}

/** Friendly default label from the browser's user agent. */
export function guessDeviceName(ua: string): string {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/CrOS/i.test(ua)) return "Chromebook";
  return "This device";
}
