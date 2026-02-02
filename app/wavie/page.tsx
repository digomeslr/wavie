"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function WavieHome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 1) precisa estar logado
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!alive) return;

      if (userErr || !user) {
        router.replace("/wavie/login");
        return;
      }

      // 2) precisa ser wavie_admin (RLS permite ler o próprio profile)
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle<{ role: string | null }>();

      if (!alive) return;

      if (profErr || profile?.role !== "wavie_admin") {
        router.replace("/"); // ou crie /wavie/forbidden depois
        return;
      }

      setRole(profile.role ?? null);
      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/wavie/login");
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="text-sm text-neutral-600">Verificando acesso…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Área interna Wavie</h1>
          <p className="mt-2 text-neutral-600">
            Acesso autorizado (<span className="font-medium">{role}</span>).
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
        >
          Sair
        </button>
      </div>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-700">
          Próximo passo: <span className="font-medium">Clientes</span> (lista e
          detalhe).
        </p>
      </div>
    </main>
  );
}
