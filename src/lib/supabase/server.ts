import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withAuthCookieDomain } from "@/lib/cookie-domain";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withAuthCookieDomain(options))
            );
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies can't be set. This is safe to ignore if middleware
            // is refreshing sessions.
          }
        },
      },
    }
  );
}
