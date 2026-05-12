import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteForUser, reasonToParam } from "@/lib/invites";
import { withAuthCookieDomain } from "@/lib/cookie-domain";
import { resolvePostAuthDestination } from "@/lib/post-auth";

// Returns an internal path for callers that build a Location string, but
// short-circuits with redirect() when the destination is cross-host (e.g.
// signup on the apex resolving to the tenant's subdomain).
async function nextPathOrRedirect(user: User): Promise<string> {
  const dest = await resolvePostAuthDestination(user);
  if (dest.kind === "external") redirect(dest.url);
  return dest.path;
}

const SWITCH_FLASH_COOKIE = "flash_prev_user_email";

// We use next/navigation's redirect() rather than NextResponse.redirect so
// Supabase-ssr's cookie writes (via next/headers' cookies().set()) reach
// the browser — NextResponse.redirect drops them and the invitee lands on
// /auth/set-password without a session.
//
// `needsPassword` keys off `user_metadata.password_set` because Supabase's
// PKCE flow often drops the URL's `type` param on the final redirect, so
// checking `type === "invite"` would false-negative for brand-new invitees.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const errorParam = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  if (errorParam) {
    const reason = errorCode || errorParam;
    const message = errorDescription || reason;
    redirect(`/login?error=${encodeURIComponent(reason)}&message=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();

  // Capture the pre-verify email so we can flash a warning when an invite
  // link silently replaces a different user's session.
  const { data: before } = await supabase.auth.getUser();
  const previousEmail = before.user?.email?.toLowerCase() ?? null;

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (type as "invite" | "email" | "recovery" | "magiclink") || "invite",
    });
    if (error) {
      redirect(`/login?error=otp_failed&message=${encodeURIComponent(error.message)}`);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(`/login?error=code_exchange_failed&message=${encodeURIComponent(error.message)}`);
    }
  } else {
    redirect("/login?error=invalid_link");
  }

  redirect(await nextDestination());

  async function nextDestination(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return "/login?error=session_missing";

    const newEmail = user.email?.toLowerCase() ?? null;
    if (previousEmail && newEmail && previousEmail !== newEmail) {
      const store = await cookies();
      store.set(
        SWITCH_FLASH_COOKIE,
        previousEmail,
        withAuthCookieDomain({
          httpOnly: true,
          sameSite: "lax" as const,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 5,
        }),
      );
    }

    // Token may be on user_metadata (new users, stamped by inviteUserByEmail)
    // or the URL (existing users via signInWithOtp — metadata is only
    // writable at account creation).
    const metadata = (user.user_metadata ?? {}) as {
      invite_token?: string;
      password_set?: boolean;
      needs_password?: boolean;
    };
    const metaToken = metadata.invite_token;
    const token = metaToken ?? searchParams.get("invite_token");
    // Either invite path (tenant-admin via invite_token, platform-onboarded
    // owner via needs_password) requires the set-password step until the
    // user has actually set one.
    const needsPassword =
      (metaToken !== undefined || metadata.needs_password === true) &&
      metadata.password_set !== true;

    if (token) {
      const outcome = await acceptInviteForUser(user, token);
      if (!outcome.ok) {
        return `/tenants?error=${reasonToParam(outcome.reason)}`;
      }
      return needsPassword ? "/auth/set-password" : await nextPathOrRedirect(user);
    }

    return needsPassword ? "/auth/set-password" : await nextPathOrRedirect(user);
  }
}
