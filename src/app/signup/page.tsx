"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction, type ActionResult } from "@/app/auth/actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(signupAction, {});
  const [role, setRole] = useState<"patient" | "doctor">("patient");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Medical Memory</p>
        </div>

        <form action={formAction} className="space-y-4 rounded-md border border-border bg-surface p-6">
          {state.error && (
            <div role="alert" className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.error}
            </div>
          )}

          <div>
            <span className="mb-1 block text-sm font-medium">Account type</span>
            <div className="grid grid-cols-2 gap-2">
              {(["patient", "doctor"] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`rounded-sm border px-3 py-2 text-sm capitalize ${
                    role === r ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-muted"
                  }`}
                >
                  {r === "doctor" ? "Doctor / Provider" : "Patient"}
                </button>
              ))}
            </div>
            <input type="hidden" name="role" value={role} />
          </div>

          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              required
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {role === "doctor" && (
            <div>
              <label htmlFor="orgName" className="mb-1 block text-sm font-medium">
                Organization / hospital
              </label>
              <input
                id="orgName"
                name="orgName"
                required
                placeholder="e.g. Demo General Hospital"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
