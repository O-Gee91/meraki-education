/** Recovery links may return only to this app, never a caller-provided external site. */
export function recoveryOrigin(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:") {
    return url.origin;
  }
  const hosts = [
    "meraki-education.app", "www.meraki-education.app", "meraki-education.lovable.app",
    "id-preview--507de411-a4a4-440c-8cab-4d1940138dd1.lovable.app",
  ];
  return url.protocol === "https:" && !url.port && hosts.includes(url.hostname) ? url.origin : null;
}