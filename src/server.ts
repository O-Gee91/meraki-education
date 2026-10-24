import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const SUPABASE_ORIGIN = process.env['VITE_SUPABASE_URL'] ?? "https://*.supabase.co";

// The Lovable editor previews the site inside an iframe, so those origins have
// to stay framable. The live school site must not be framable by anyone else,
// which is what clickjacking protection depends on.
const PREVIEW_FRAME_ANCESTORS = "'self' https://*.lovable.app https://*.lovable.dev";

function isPreviewHost(host: string): boolean {
  return host.endsWith(".lovable.app") || host.endsWith(".lovable.dev") || host.startsWith("localhost");
}

// Content-Security-Policy is only meaningful on HTML documents; adding it to
// static assets or JSON API responses has no effect.
function buildCsp(frameAncestors: string, nonce: string): string {
  return [
    "default-src 'self'",
    // Inline scripts (theme pre-paint, hydration stream) carry a per-request
    // nonce stamped in by withSecurityHeaders, so 'unsafe-inline' is not needed.
    // eval() is not needed either.
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src 'self' blob: data: ${SUPABASE_ORIGIN} https://*.supabase.co wss://*.supabase.co https://ai.gateway.lovable.dev https://connector-gateway.lovable.dev https://*.lovable.app https://*.lovable.dev https://*.tinybird.co https://api.tinybird.co`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";

  let host = "";
  try {
    host = new URL(request.url).hostname;
  } catch {
    host = "";
  }
  const preview = isPreviewHost(host);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", preview ? "SAMEORIGIN" : "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  // Nothing useful comes from telling a scanner which stack serves the page.
  headers.delete("X-Powered-By");
  headers.delete("Server");

  if (contentType.includes("text/html")) {
    headers.set(
      "Content-Security-Policy",
      buildCsp(preview ? PREVIEW_FRAME_ANCESTORS : "'self'"),
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};

