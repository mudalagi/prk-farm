"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolvePostAuthDestination } from "@/lib/post-auth";

export type AuthActionResult = { error?: string } | void;

// Resolve the right tenant host + set active_tenant_id inline so the user
// doesn't bounce through /auth/resume. The helper returns either an internal
// path (same origin) or an external URL (cross-host); next/navigation's
// redirect() supports both.
async function redirectAfterAuth(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const dest = await resolvePostAuthDestination(user);
  redirect(dest.kind === "external" ? dest.url : dest.path);
}

export async function login(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email?.trim()) return { error: "Email is required" };
  if (!password) return { error: "Password is required" };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Backfill password_set so future invite-link clicks skip /auth/set-password
  // for this account. updateUser merges at the top level, so no spread.
  const meta = (data.user?.user_metadata ?? {}) as { password_set?: boolean };
  if (data.user && meta.password_set !== true) {
    await supabase.auth.updateUser({ data: { password_set: true } });
  }

  revalidatePath("/");
  await redirectAfterAuth();
}

export async function setPassword(
  _prev: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  const supabase = await createClient();

  // Drop invite_token / needs_password after use so they can't re-trigger
  // set-password or accept-invite logic on a future callback hit.
  const { data: userRes } = await supabase.auth.getUser();
  const existing = (userRes.user?.user_metadata ?? {}) as Record<string, unknown>;
  const nextMeta = { ...existing, password_set: true };
  delete (nextMeta as { invite_token?: string }).invite_token;
  delete (nextMeta as { needs_password?: boolean }).needs_password;

  const { error } = await supabase.auth.updateUser({ password, data: nextMeta });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  await redirectAfterAuth();
}
