import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { TopNav } from "@/components/ui/TopNav";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav role={profile.role} fullName={profile.full_name} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
