import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WavieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Não logado → login interno Wavie
  if (!user) redirect("/wavie/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  // Falha segura
  if (error || profile?.role !== "wavie_admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {children}
    </div>
  );
}
