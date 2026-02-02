"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  service_type: "praia" | "restaurante" | string;
  status: "trial" | "ativo" | "suspenso" | string;
  created_at: string;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function WavieClientsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [meRole, setMeRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [serviceType, setServiceType] = useState<"praia" | "restaurante">(
    "praia"
  );
  const [status, setStatus] = useState<"trial" | "ativo" | "suspenso">("trial");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

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

      setMeRole(profile.role);
      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  // load clients
  async function load() {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("id,name,slug,service_type,status,created_at")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as ClientRow[]);
  }

  useEffect(() => {
    if (!checking) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  // auto slug suggestion
  useEffect(() => {
    if (!name) return;
    if (slug.trim().length > 0) return;
    setSlug(slugify(name));
  }, [name]); // intentionally not depending on slug

  const canCreate = useMemo(() => {
    return name.trim().length >= 2 && slugify(slug).length >= 2;
  }, [name, slug]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateErr(null);

    const finalSlug = slugify(slug);
    if (!finalSlug) {
      setCreateErr("Slug inválido.");
      return;
    }

    setCreating(true);

    const { error } = await supabase.from("clients").insert({
      name: name.trim(),
      slug: finalSlug,
      service_type: serviceType,
      status,
    });

    setCreating(false);

    if (error) {
      setCreateErr(error.message);
      return;
    }

    // reset + reload
    setName("");
    setSlug("");
    setServiceType("praia");
    setStatus("trial");
    await load();
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
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Área interna ({meRole})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/wavie"
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

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Create */}
        <section className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-semibold">Novo cliente</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Cria um cliente na plataforma (não mexe em barraca ainda).
          </p>

          <form onSubmit={handleCreate} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Nome
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Barraca do João"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Slug
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="barraca-do-joao"
                required
              />
              <div className="mt-1 text-xs text-neutral-500">
                URL pública futura:{" "}
                <span className="font-medium">/b/{slugify(slug || "slug")}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-800">
                  Serviço
                </label>
                <select
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  value={serviceType}
                  onChange={(e) =>
                    setServiceType(e.target.value as "praia" | "restaurante")
                  }
                >
                  <option value="praia">Praia</option>
                  <option value="restaurante">Restaurante</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-800">
                  Status
                </label>
                <select
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "trial" | "ativo" | "suspenso")
                  }
                >
                  <option value="trial">Trial</option>
                  <option value="ativo">Ativo</option>
                  <option value="suspenso">Suspenso</option>
                </select>
              </div>
            </div>

            {createErr ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createErr}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canCreate || creating}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "Criando…" : "Criar cliente"}
            </button>
          </form>
        </section>

        {/* List */}
        <section className="lg:col-span-3 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Lista</h2>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900 disabled:opacity-60"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-700">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">Slug</th>
                  <th className="px-3 py-2 text-left font-medium">Serviço</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-10 text-center text-neutral-500"
                      colSpan={4}
                    >
                      {loading ? "Carregando…" : "Nenhum cliente ainda."}
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2 font-medium text-neutral-900">
  <Link href={`/wavie/clientes/${c.id}`} className="hover:underline">
    {c.name}
  </Link>
</td>

                      <td className="px-3 py-2 text-neutral-700">
                        {c.slug}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">
                        {c.service_type}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
