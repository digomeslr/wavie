"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  service_type: "praia" | "restaurante" | string;
  status: "trial" | "ativo" | "suspenso" | string;
  created_at: string;
  updated_at: string;
};

export default function WavieClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [checking, setChecking] = useState(true);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);

  const [status, setStatus] = useState<"trial" | "ativo" | "suspenso">("trial");

  // guard wavie_admin
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!alive) return;

      if (!user) {
        router.replace("/wavie/login");
        return;
      }

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

      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  async function load() {
    if (!id) return;

    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("id,name,slug,service_type,status,created_at,updated_at")
      .eq("id", id)
      .maybeSingle<ClientRow>();

    setLoading(false);

    if (error) {
      setErr(error.message);
      setClient(null);
      return;
    }

    if (!data) {
      setErr("Cliente não encontrado.");
      setClient(null);
      return;
    }

    setClient(data);
    setStatus((data.status as any) ?? "trial");
  }

  useEffect(() => {
    if (!checking) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, id]);

  async function handleSaveStatus() {
    if (!client) return;
    setErr(null);
    setSaving(true);

    const { error } = await supabase
      .from("clients")
      .update({ status })
      .eq("id", client.id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  }

  async function handleDelete() {
    if (!client) return;

    const ok = window.confirm(
      `Tem certeza que deseja excluir "${client.name}"?\n\nIsso remove o cliente do backoffice (não apaga dados operacionais antigos automaticamente).`
    );
    if (!ok) return;

    setErr(null);
    setDeleting(true);

    const { error } = await supabase.from("clients").delete().eq("id", client.id);

    setDeleting(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.replace("/wavie/clientes");
  }

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
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cliente</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Detalhe e controle
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/wavie/clientes"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
          >
            Voltar
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
          >
            Sair
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        {loading ? (
          <div className="text-sm text-neutral-600">Carregando…</div>
        ) : client ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {client.name}
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  <span className="font-medium">Slug:</span> {client.slug} •{" "}
                  <span className="font-medium">Serviço:</span>{" "}
                  {client.service_type}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  id: {client.id}
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`/b/${client.slug}`}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir público
                </a>
                <a
                  href={`/b/${client.slug}/admin`}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir admin
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 p-3">
                <div className="text-sm font-medium text-neutral-900">
                  Status do cliente
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  Controla se o cliente pode operar (base para billing).
                </p>

                <div className="mt-3 flex gap-2">
                  <select
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as "trial" | "ativo" | "suspenso")
                    }
                  >
                    <option value="trial">Trial</option>
                    <option value="ativo">Ativo</option>
                    <option value="suspenso">Suspenso</option>
                  </select>

                  <button
                    onClick={handleSaveStatus}
                    disabled={saving}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                </div>

                <div className="mt-2 text-xs text-neutral-500">
                  Atualizado em:{" "}
                  {client.updated_at
                    ? new Date(client.updated_at).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 p-3">
                <div className="text-sm font-medium text-neutral-900">
                  Ações
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  Use com cuidado (operação/admin não são apagados automaticamente).
                </p>

                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="mt-3 w-full rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:border-red-500 disabled:opacity-60"
                >
                  {deleting ? "Excluindo…" : "Excluir cliente"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-600">Nenhum dado.</div>
        )}
      </section>
    </main>
  );
}
