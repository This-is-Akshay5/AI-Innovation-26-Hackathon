import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "DATABASE_ERROR"
  | "BLOCKCHAIN_ERROR"
  | "AI_ERROR"
  | "CONFLICT";

/**
 * All API errors share one shape so the frontend can branch on `code`
 * rather than parsing prose. Messages are safe to surface to users — they
 * never contain medical content or internal identifiers beyond the
 * resource the caller already referenced.
 */
export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const ERRORS = {
  unauthenticated: () => apiError("UNAUTHENTICATED", "You must be signed in to perform this action.", 401),
  permissionDenied: (detail = "You are not authorized to access this resource.") =>
    apiError("PERMISSION_DENIED", detail, 403),
  notFound: (what = "resource") => apiError("NOT_FOUND", `The requested ${what} was not found.`, 404),
  invalidInput: (detail: string) => apiError("INVALID_INPUT", detail, 400),
  databaseError: (detail = "The database rejected this operation.") => apiError("DATABASE_ERROR", detail, 500),
} as const;

export interface AuthedContext {
  userId: string;
  role: UserRole;
  fullName: string;
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
}

/**
 * Resolves the caller's identity and role from the session cookie.
 * Every mutating route calls this first — no route trusts a role or user
 * id sent in the request body.
 */
export async function requireUser(): Promise<AuthedContext | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return { userId: user.id, role: profile.role, fullName: profile.full_name, supabase };
}
