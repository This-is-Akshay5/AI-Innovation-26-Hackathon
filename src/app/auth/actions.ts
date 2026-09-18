"use server";

import { redirect } from "next/navigation";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { UserRole } from "@/lib/types/database";

export interface ActionResult {
  error?: string;
}

export async function signupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "") as UserRole;
  const orgName = String(formData.get("orgName") || "").trim();

  if (!email || !password || !fullName) {
    return { error: "Name, email, and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!["patient", "doctor"].includes(role)) {
    return { error: "Select an account type." };
  }
  if (role === "doctor" && !orgName) {
    return { error: "Organization / hospital name is required for provider accounts." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    return { error: error?.message ?? "Sign up failed." };
  }

  // Profile row creation happens with the service client because at this
  // point (immediately post sign-up, before email confirmation settles)
  // the session cookie may not be fully established for an RLS-checked
  // insert. The profile id is still bound to auth.uid() by RLS on future
  // reads/writes — this single bootstrap insert is the one exception.
  const service = createServiceSupabase();
  const { error: profileError } = await service.from("profiles").insert({
    id: data.user.id,
    role,
    full_name: fullName,
  });

  if (profileError) {
    return { error: `Account created but profile setup failed: ${profileError.message}` };
  }

  if (role === "doctor" && orgName) {
    const { data: org } = await service
      .from("organizations")
      .insert({ name: orgName })
      .select("id")
      .single();
    if (org) {
      await service.from("provider_memberships").insert({
        profile_id: data.user.id,
        organization_id: org.id,
      });
    }
  }

  await writeAudit({
    actorId: data.user.id,
    actorRole: role,
    action: "login",
    authorizationContext: "Account created",
  });

  // With "Confirm email" enabled, signUp() returns a user but no session.
  // Redirecting would bounce straight back to /login with no explanation,
  // so say what actually needs to happen instead.
  if (!data.session) {
    return {
      error:
        "Account created, but it needs email confirmation before you can sign in. Check your inbox, or turn off Authentication -> Sign In / Providers -> Email -> \"Confirm email\" in your Supabase project for demo use.",
    };
  }

  redirect(role === "doctor" ? "/doctor" : "/patient");
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Bad credentials stay deliberately vague so the form can't be used to
    // enumerate which emails have accounts. Configuration failures are a
    // different matter — those are ours, not the user's, and hiding them
    // just sends people hunting for a typo that isn't there.
    if (error?.code === "email_not_confirmed") {
      return {
        error:
          "This account exists but its email is not confirmed. Confirm it from the signup email, or turn off Authentication -> Sign In / Providers -> Email -> \"Confirm email\" in your Supabase project for demo use.",
      };
    }
    if (error?.status === 0 || /fetch failed|network/i.test(error?.message ?? "")) {
      return { error: "Could not reach the authentication service. Check NEXT_PUBLIC_SUPABASE_URL and your connection." };
    }
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();

  await writeAudit({
    actorId: data.user.id,
    actorRole: profile?.role ?? null,
    action: "login",
  });

  redirect(next || (profile?.role === "doctor" ? "/doctor" : "/patient"));
}

export async function logoutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
