"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export type AuthActionResult = { error?: string } | void;

// After a successful sign-in, prefer landing directly on the dashboard when
// we're already on the right tenant host (middleware has stamped
// x-tenant-id from the domain). Falls back to /auth/resume only when the
// destination depends on cross-host routing or a multi-tenant picker.
async function postAuthDestination(): Promise<string> {
  const h = await headers();
  if (h.get("x-tenant-id")) return "/";
  return "/auth/resume";
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
  redirect(await postAuthDestination());
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
  redirect(await postAuthDestination());
}
