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
