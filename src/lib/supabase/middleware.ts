import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost } from "@/lib/platform-hosts";
import { withAuthCookieDomain } from "@/lib/cookie-domain";

type CookieWrite = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  // Forward a mutable copy of request headers so Server Components can read
  // x-pathname / x-host / x-tenant-id / x-platform-host via `headers()`.
  // Setting headers on the response only sends them back to the browser —
  // RSCs read request headers, not response headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const host = normalizeHost(request.headers.get("host"));
  if (host) requestHeaders.set("x-host", host);

  // Collect any cookies the Supabase SSR client wants to set; we'll replay
  // them onto the final response below. This avoids the pitfall of recreating
  // NextResponse.next() mid-flow (which silently drops any headers we set
  // AFTER recreation).
  const cookiesToSet: CookieWrite[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(next) {
          for (const c of next) {
            // Keep the incoming request in sync so later reads inside this
            // middleware invocation see the refreshed value.
            request.cookies.set(c.name, c.value);
            // Remember it for the response write-out, scoped to the apex
            // domain when AUTH_COOKIE_DOMAIN is configured.
            cookiesToSet.push({
              name: c.name,
              value: c.value,
              options: withAuthCookieDomain(c.options),
            });
          }
        },
      },
    },
  );

  // Refresh the session — this is what keeps the user logged in.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve host → tenant. Customer hosts carry tenant context via the
  // mapping; platform-apex hits don't, so we fall through.
  let resolvedTenant: string | null = null;
  if (host) {
    const { data: tenantId } = await supabase.rpc("resolve_tenant_by_domain", {
      p_domain: host,
    });
    resolvedTenant = (tenantId as string | null) ?? null;
    if (resolvedTenant) requestHeaders.set("x-tenant-id", resolvedTenant);
  }

  // Tag platform apex requests (chukta.in) so downstream can route them to
  // the operator console. Tenant mapping wins if the same host is both in
  // PLATFORM_HOSTS and in tenant_domains (e.g. localhost during dev).
  if (host && !resolvedTenant && isPlatformHost(host)) {
    requestHeaders.set("x-platform-host", "1");
  }

  const publicPaths = [
    "/login",
    "/setup",
    "/auth/callback",
    "/auth/set-password",
    "/auth/signout",
    "/preview",
  ];
  const isPublicPath = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectRes = NextResponse.redirect(url);
    for (const { name, value, options } of cookiesToSet) {
      redirectRes.cookies.set(name, value, options);
    }
    return redirectRes;
  }

  // Build the final response AFTER every header mutation so the forwarded
  // request headers include x-tenant-id / x-platform-host. Replay any cookies
  // Supabase wanted to write onto this response.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }
  return response;
}

// Lowercase the host. Keep the port for localhost so `localhost:3000` can
// resolve without colliding with real prod domains; strip the port for real
// hosts.
function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return trimmed;
  }
  return trimmed.split(":")[0];
}
