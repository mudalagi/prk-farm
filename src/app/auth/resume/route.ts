import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformHost, schemeFor } from "@/lib/platform-hosts";
import { withAuthCookieDomain } from "@/lib/cookie-domain";

// Tenant users must cross-origin back to their tenant host: the protected
// layout rejects non-platform-admins on the apex with "Wrong door".
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const base = request.nextUrl.clone();
  base.search = "";

  if (!user) {
    base.pathname = "/login";
    return NextResponse.redirect(base);
  }

  // Platform admin goes straight to the console.
  const { data: isPlatform } = await supabase.rpc("is_platform_admin");
  if (isPlatform === true) {
    base.pathname = "/platform";
    return NextResponse.redirect(base);
  }

  // List memberships + each tenant's primary domain in one round trip
  // through the service role (so we don't get RLS-filtered to just the
  // active tenant).
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("tenant_members")
    .select("tenant_id, tenants!inner(id, name)")
    .eq("user_id", user.id);

  const tenantIds = (memberships ?? []).map((m) => m.tenant_id as string);

  if (tenantIds.length === 0) {
    // Nothing to land on — sign out inline (the /auth/signout route is POST
    // only, so a redirect there via GET would 405) and surface the reason
    // on the login screen.
    await supabase.auth.signOut();
    base.pathname = "/login";
    base.searchParams.set("error", "no_tenant");
    return NextResponse.redirect(base);
  }

  // Fetch primary domains for those tenants — cross-origin redirect target.
  const { data: primaries } = await admin
    .from("tenant_domains")
    .select("tenant_id, domain")
    .in("tenant_id", tenantIds)
    .eq("is_primary", true);
  const primaryByTenant = new Map<string, string>(
    (primaries ?? []).map((d) => [d.tenant_id as string, d.domain as string]),
  );

  const cookieOpts = withAuthCookieDomain({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (tenantIds.length === 1) {
    const only = tenantIds[0];
    const primary = primaryByTenant.get(only);
    let target: string;
    if (primary) {
      target = `${schemeFor(primary)}://${primary}/`;
    } else if (!isPlatformHost(request.headers.get("host"))) {
      target = `${base.origin}/`;
    } else {
      // On platform apex with no primary domain — picker avoids "Wrong door".
      base.pathname = "/tenants";
      target = base.toString();
    }
    const res = NextResponse.redirect(target);
    res.cookies.set("active_tenant_id", only, cookieOpts);
    return res;
  }

  // Pick any tenant's primary host to render the picker on — avoids landing
  // on the apex where non-admins get "Wrong door".
  const firstPrimary = tenantIds
    .map((id) => primaryByTenant.get(id))
    .find((d): d is string => !!d);
  if (firstPrimary) {
    return NextResponse.redirect(`${schemeFor(firstPrimary)}://${firstPrimary}/tenants`);
  }
  base.pathname = "/tenants";
  return NextResponse.redirect(base);
}
