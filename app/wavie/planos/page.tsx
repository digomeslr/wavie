"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PlanRow = {
  id: string;
  code: string;
  name: string;
  service_type: "praia" | "restaurante" | string;
  billing_mode: "fixed" | "commission" | "hybrid" | string;
  price_cents: number;
  currency: string;
  commission_bps: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function formatBRLFromCents(cents: number) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function WaviePlansPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PlanRow>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Guard wavie_admin
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
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("plans")
      .select(
        "id,code,name,service_type,billing_mode,price_cents,currency,commission_bps,active,created_at,updated_at"
      )
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as PlanRow[]);
  }

  useEffect(() => {
    if (!checking) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  function startEdit(p: PlanRow) {
    setEditingId(p.id);
    setSaveErr(null);
    setDraft({
      id: p.id,
      name: p.name,
      service_type: p.service_type,
      billing_mode: p.billing_mode,
      price_cents: p.price_cents,
      commission_bps: p.commission_bps,
      active: p.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
    setSaveErr(null);
  }

  const canSave = useMemo(() => {
    if (!editingId) return false;
    const nameOk = (draft.name ?? "").trim().length >= 2;
    const stOk =
      draft.service_type === "praia" || draft.service_type === "restaurante";
    const bmOk =
      draft.billing_mode === "fixed" ||
      draft.billing_mode === "commission" ||
      draft.billing_mode === "hybrid";
    const priceOk = Number.isFinite(Number(draft.price_cents)) && (draft.price_cents as number) >= 0;
    const commOk =
      Number.isFinite(Number(draft.commission_bps)) &&
      (draft.commission_bps as number) >= 0 &&
      (draft.commission_bps as number) <= 10000;

    return nameOk && stOk && bmOk && priceOk && commOk;
  }, [draft, editingId]);

  async function save() {
    if (!editingId) return;
    setSaveErr(null);
    setSaving(true);

    const payload = {
      name: (draft.name ?? "").trim(),
      service_type: draft.service_type,
      billing_mode: draft.billing_mode,
      price_cents: Number(draft.price_cents ?? 0),
      commission_bps: Number(draft.commission_bps ?? 0),
      active: !!draft.active,
    };

    const { error } = await supabase.from("plans").update(payload).eq("id", editingId);

    setSaving(false);

    if (error) {
      setSaveErr(error.message);
      return;
    }

    await load();
    cancelEdit();
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
          <h1 className="text-2xl font-semibold">Planos</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Controle de preços e comissão (somente Wavie Admin).
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

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Lista de planos</h2>
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

        {saveErr ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveErr}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Plano</th>
                <th className="px-3 py-2 text-left font-medium">Serviço</th>
                <th className="px-3 py-2 text-left font-medium">Modelo</th>
                <th className="px-3 py-2 text-left font-medium">Mensalidade</th>
                <th className="px-3 py-2 text-left font-medium">Comissão</th>
                <th className="px-3 py-2 text-left font-medium">Ativo</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-neutral-500">
                    {loading ? "Carregando…" : "Nenhum plano encontrado."}
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const isEditing = editingId === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{p.name}</div>
                        <div className="text-xs text-neutral-500">{p.code}</div>
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                            value={String(draft.service_type ?? p.service_type)}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, service_type: e.target.value }))
                            }
                          >
                            <option value="praia">praia</option>
                            <option value="restaurante">restaurante</option>
                          </select>
                        ) : (
                          <span className="text-neutral-700">{p.service_type}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                            value={String(draft.billing_mode ?? p.billing_mode)}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, billing_mode: e.target.value }))
                            }
                          >
                            <option value="fixed">fixed</option>
                            <option value="commission">commission</option>
                            <option value="hybrid">hybrid</option>
                          </select>
                        ) : (
                          <span className="text-neutral-700">{p.billing_mode}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                            value={String(draft.price_cents ?? p.price_cents)}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, price_cents: Number(e.target.value) }))
                            }
                          />
                        ) : (
                          <span className="text-neutral-700">{formatBRLFromCents(p.price_cents)}</span>
                        )}
                        <div className="text-xs text-neutral-500">
                          {isEditing ? "em centavos" : ""}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                            value={String(draft.commission_bps ?? p.commission_bps)}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                commission_bps: Number(e.target.value),
                              }))
                            }
                          />
                        ) : (
                          <span className="text-neutral-700">
                            {(p.commission_bps / 100).toFixed(2)}%
                          </span>
                        )}
                        <div className="text-xs text-neutral-500">{isEditing ? "em bps (100 = 1%)" : ""}</div>
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!draft.active}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, active: e.target.checked }))
                              }
                            />
                            ativo
                          </label>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs">
                            {p.active ? "ativo" : "inativo"}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={cancelEdit}
                              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={save}
                              disabled={!canSave || saving}
                              className="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                            >
                              {saving ? "Salvando…" : "Salvar"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Observação: clientes existentes usam <span className="font-medium">snapshot</span> na subscription.
          Alterar o plano aqui afeta principalmente novos clientes (ou migrações controladas).
        </div>
      </div>
    </main>
  );
}
