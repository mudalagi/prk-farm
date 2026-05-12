// Post-authentication routing.
//
// After login or set-password we need to land the user on the right tenant
// host with the right active_tenant_id. Historically every flow redirected
// to /auth/resume to do this routing, but that:
//   - flashes /auth/resume in the address bar,
//   - hits /auth/signout via GET when memberships is empty (POST-only — 405),
//   - and, on the platform apex, re-runs supabase.auth.getUser() across a
//     cross-origin hop, which intermittently misses the just-written cookie.
//
// This helper centralises the routing. login() and setPassword() call it to
// resolve the destination inline (no bounce). /auth/resume keeps the same
// behaviour as a fallback for stale-cookie or deleted-tenant cases.

import { cookies, headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformHost, schemeFor } from "@/lib/platform-hosts";
import { withAuthCookieDomain } from "@/lib/cookie-domain";

const ACTIVE_TENANT_COOKIE = "active_tenant_id";

export type PostAuthDestination =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string };

export async function resolvePostAuthDestination(user: User): Promise<PostAuthDestination> {
  const admin = createAdminClient();

  // Platform admin shortcut — operator console lives on the apex.
  const { data: platform } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (platform) {
    return { kind: "internal", path: "/platform" };
  }

  // Tenant memberships.
  const { data: memberships } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id);
  const tenantIds = (memberships ?? []).map((m) => m.tenant_id as string);

  if (tenantIds.length === 0) {
    // Authenticated but no tenants — surface this on /login rather than
    // looping through /auth/signout (POST-only).
    return { kind: "internal", path: "/login?error=no_tenant" };
  }

  // Map tenant ids → primary domains in one query.
  const { data: primaries } = await admin
    .from("tenant_domains")
    .select("tenant_id, domain")
    .in("tenant_id", tenantIds)
    .eq("is_primary", true);
  const primaryByTenant = new Map<string, string>(
    (primaries ?? []).map((d) => [d.tenant_id as string, d.domain as string]),
  );

  const h = await headers();
  const host = (h.get("x-host") ?? h.get("host") ?? "").toLowerCase();

  if (tenantIds.length === 1) {
    const tenantId = tenantIds[0];
    const primary = primaryByTenant.get(tenantId);

    await setActiveTenantCookie(tenantId);

    if (!primary || primary === host) {
      return { kind: "internal", path: "/" };
    }
    return { kind: "external", url: `${schemeFor(primary)}://${primary}/` };
  }

  // Multi-tenant — render the picker. Avoid landing it on the platform apex
  // where non-admins see "Wrong door".
  const firstPrimary = tenantIds.map((id) => primaryByTenant.get(id)).find((d): d is string => !!d);
  if (firstPrimary && isPlatformHost(host)) {
    return { kind: "external", url: `${schemeFor(firstPrimary)}://${firstPrimary}/tenants` };
  }
  return { kind: "internal", path: "/tenants" };
}

async function setActiveTenantCookie(tenantId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_TENANT_COOKIE,
    tenantId,
    withAuthCookieDomain({
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    }),
  );
}
