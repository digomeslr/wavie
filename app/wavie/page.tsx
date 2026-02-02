"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "wavie_admin" | string;

function Card({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-neutral-900 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-neutral-900">{title}</div>
          <div className="mt-1 text-sm text-neutral-600">{desc}</div>
        </div>
        <div className="mt-0.5 text-neutral-400 group-hover:text-neutral-900 transition">
          →
        </div>
      </div>
    </Link>
  );
}

export default function WavieHome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 1) precisa estar logado
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!alive) return;

      if (!user) {
        router.replace("/wavie/login");
        return;
      }

      // 2) precisa ser wavie_admin
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle<{ role: string | null }>();

      if (!alive) return;

      if (profErr || profile?.role !== "wavie_admin") {
        router.replace("/");
        return;
      }

      setRole(profile?.role ?? null);
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
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              Área interna Wavie
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Acesso autorizado <span className="font-medium">({role})</span>.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
          >
            Sair
          </button>
        </div>

        {/* Menu */}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-neutral-900">Menu</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Acesse as áreas principais do backoffice.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card
              title="Clientes"
              desc="Cadastro, status (trial/ativo/suspenso) e vínculo com barraca."
              href="/wavie/clientes"
            />
            <Card
              title="Planos"
              desc="Editar preço, comissão, modo de cobrança e ativação."
              href="/wavie/planos"
            />
            <Card
              title="Reajustes"
              desc="Reajuste geral (em massa), com log e filtros por serviço."
              href="/wavie/reajustes"
            />
            <Card
              title="Faturas"
              desc="Gerar/atualizar invoices por mês e marcar como sent/paid."
              href="/wavie/faturas"
            />
            <Card
              title="Abrir cardápio de uma barraca"
              desc="Acessar /b/[slug] para validar menu, checkout e operação."
              href="/b/nelsaodrinks"
            />
            <Card
              title="Painel operacional (global)"
              desc="Validar operação em tempo real (se aplicável)."
              href="/painel"
            />
          </div>
        </section>

        {/* Nota rápida */}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-semibold text-neutral-900">
            Observação importante
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Planos afetam principalmente novos clientes. Clientes existentes usam{" "}
            <span className="font-mono">snapshot</span> na{" "}
            <span className="font-mono">subscriptions</span>. Reajustes em massa
            alteram snapshots via RPC e ficam auditados em{" "}
            <span className="font-mono">billing_adjustments</span>.
          </p>
        </section>
      </div>
    </main>
  );
}
