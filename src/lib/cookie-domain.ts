// Cross-subdomain cookie scoping for the multi-tenant deploy.
//
// In production every tenant lives on its own subdomain of the same apex
// (e.g. `prk.chukta.in`, `acme.chukta.in`) plus the platform console at
// `chukta.in`. Without an explicit `domain` attribute, Supabase auth cookies
// and the `active_tenant_id` cookie are bound to the exact host that set
// them — which means /auth/resume's cross-host redirect loses the session
// and the user gets bounced to /login on the destination subdomain.
//
// Setting AUTH_COOKIE_DOMAIN=.chukta.in (leading dot, lowercased) makes the
// auth cookies visible across every chukta.in subdomain, so an invite that
// lands on the apex still authenticates the user on their tenant subdomain.
// Leave the variable unset in local dev — browsers ignore `domain` for
// `localhost`, and it can confuse cookie inspection tools.

import type { CookieOptions } from "@supabase/ssr";

export function getAuthCookieDomain(): string | undefined {
  const raw = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return raw ? raw : undefined;
}

export function withAuthCookieDomain<T extends Partial<CookieOptions> & Record<string, unknown>>(
  options: T,
): T {
  const domain = getAuthCookieDomain();
  if (!domain) return options;
  return { ...options, domain };
}
