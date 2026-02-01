import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function WavieLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se já estiver logado, não faz sentido mostrar login
  if (user) redirect("/wavie");

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm border border-neutral-200">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Login Wavie</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Área interna — acesso restrito.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
