"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/auth/actions";

const PATIENT_LINKS = [
  { href: "/patient", label: "Dashboard" },
  { href: "/patient/timeline", label: "Medical Timeline" },
  { href: "/patient/access", label: "Access" },
  { href: "/patient/audit", label: "Audit Trail" },
];

const DOCTOR_LINKS = [
  { href: "/doctor", label: "Dashboard" },
  { href: "/doctor/patients", label: "Patients" },
  { href: "/doctor/audit", label: "Audit Trail" },
];

export function TopNav({
  role,
  fullName,
}: {
  role: "patient" | "doctor" | "provider_admin";
  fullName: string;
}) {
  const links = role === "doctor" ? DOCTOR_LINKS : PATIENT_LINKS;
  const currentPath = usePathname();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Medical Memory
          </Link>
          <nav className="hidden gap-1 sm:flex" aria-label="Primary">
            {links.map((link) => {
              const active = currentPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-accent-soft text-accent font-medium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{fullName}</p>
            <p className="text-xs capitalize leading-tight text-muted">{role.replace("_", " ")}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-sm border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:hidden" aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap rounded-sm px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
