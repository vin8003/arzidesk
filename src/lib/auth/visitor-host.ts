/**
 * Custom-domain OAuth: Cloudflare orange-cloud can forward Host as the grok.me
 * origin, so Better Auth falls back to BETTER_AUTH_URL and Google/X callback
 * on grok.me (session cookie never lands on the visitor's domain).
 *
 * Prefer Origin / Referer / x-forwarded-host / a short-lived host cookie when
 * that host is one of ours, then pin `x-forwarded-host` so dynamic baseURL
 * matches the address bar.
 */

const CUSTOM_HOSTS = [
  "arzidesk.ordereasy.win",
  "*.ordereasy.win",
] as const;

const HOST_COOKIE = "__Host-grok-auth.public_host";

function stripPort(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isCustomAuthHost(host: string): boolean {
  const h = stripPort(host);
  if (!h) return false;
  for (const pattern of CUSTOM_HOSTS) {
    if (pattern.startsWith("*.")) {
      if (h === pattern.slice(2)) return true;
      if (h.endsWith(pattern.slice(1))) return true;
    } else if (h === pattern) {
      return true;
    }
  }
  return false;
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const host = stripPort(new URL(value).host);
    return host || null;
  } catch {
    return null;
  }
}

function cookieHost(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== HOST_COOKIE) continue;
    try {
      return stripPort(decodeURIComponent(trimmed.slice(eq + 1)));
    } catch {
      return stripPort(trimmed.slice(eq + 1));
    }
  }
  return null;
}

/** First host on this request that is one of our custom production names. */
export function visitorAuthHost(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const hostHdr = request.headers.get("host") ?? "";
  const candidates = [
    hostFromUrl(request.headers.get("origin")),
    hostFromUrl(request.headers.get("referer")),
    xf ? stripPort(xf) : null,
    cookieHost(request),
    hostHdr ? stripPort(hostHdr) : null,
  ];
  for (const host of candidates) {
    if (host && isCustomAuthHost(host)) return host;
  }
  return null;
}

export function pinAuthVisitorHost(request: Request): Request {
  const host = visitorAuthHost(request);
  if (!host) return request;
  const current = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (current === host) return request;
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", "https");
  return new Request(request, { headers });
}

export function withPublicHostCookie(response: Response, request: Request): Response {
  const host = visitorAuthHost(request);
  if (!host) return response;
  const headers = new Headers(response.headers);
  headers.append(
    "set-cookie",
    `${HOST_COOKIE}=${encodeURIComponent(host)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
