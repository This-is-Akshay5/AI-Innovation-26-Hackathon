import { createServerClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * Session-scoped client. Every query through this client is subject to the
 * RLS policies in supabase/migrations/0001_init.sql — this is what makes
 * authorization real rather than a frontend-only check. Use this for all
 * reads and for any write the *end user* is performing.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no response to write to —
            // safe to ignore because middleware refreshes the session anyway.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. Bypasses RLS entirely. This is ONLY used server-side,
 * ONLY for operations the application must perform regardless of end-user
 * row ownership — namely writing audit_events (so clients can't forge audit
 * history) and the two-step "approve permission + register on-chain" flow
 * where the on-chain confirmation callback needs to update a row the
 * approving patient already authorized via RLS-checked insert.
 *
 * NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client. It is read only from
 * server-only files (API routes, server actions) and is absent from
 * NEXT_PUBLIC_* env vars.
 */
export function createServiceSupabase() {
  return createRawClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
