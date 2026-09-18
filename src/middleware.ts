import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Role-aware base redirect: "/" sends patients and doctors to their
  // respective dashboards rather than a shared landing page.
  if (user && pathname === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === "doctor" ? "/doctor" : "/patient";
    return NextResponse.redirect(url);
  }

  // Cross-role guard: a patient hitting /doctor/* or a doctor hitting
  // /patient/* is redirected home rather than silently rendered — the UI
  // itself never assumes the visitor's role.
  if (user && (pathname.startsWith("/doctor") || pathname.startsWith("/patient"))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const wantsDoctorArea = pathname.startsWith("/doctor");
    const isDoctor = profile?.role === "doctor";

    if (wantsDoctorArea && !isDoctor) {
      const url = request.nextUrl.clone();
      url.pathname = "/patient";
      return NextResponse.redirect(url);
    }
    if (!wantsDoctorArea && isDoctor) {
      const url = request.nextUrl.clone();
      url.pathname = "/doctor";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
