"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type InvoiceStatus = "open" | "sent" | "paid" | "void";

type InvoiceRow = {
  id: string;
  client_id: string;
  month: string; // date (YYYY-MM-DD)
  orders_count: number;
  gross_cents: number;
  wavie_fee_cents: number;
  status: InvoiceStatus;
  created_at: string;
  updated_at: string;
  clients?: {
    name?: string | null;
    slug?: string | null;
    service_type?: string | null;
  } | null;
};

function formatBRLFromCents(cents: number) {
  const v = (Number(cents ?? 0) as number) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthKeyFromDateString(dateStr: string) {
  if (!dateStr) return "";
  return dateStr.slice(0, 7); // YYYY-MM
}

function toMonthStartDate(monthKey: string) {
  if (!monthKey || monthKey.length !== 7) return null;
  return `${monthKey}-01`;
}

export default function WavieInvoicesPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // filtros
  const [filterMonth, setFilterMonth] = useState<string>(""); // YYYY-MM
  const [filterStatus, setFilterStatus] = useState<string>(""); // "" = todos

  // gerar fatura
  const [genClientSlug, setGenClientSlug] = useState<string>("nelsaodrinks");
  const [genMonth, setGenMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

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

    const sel =
      "id,client_id,month,orders_count,gross_cents,wavie_fee_cents,status,created_at,updated_at,clients(name,slug,service_type)";

    let q = supabase
      .from("invoices")
      .select(sel)
      .order("month", { ascending: false });

    if (filterStatus) q = q.eq("status", filterStatus);
    if (filterMonth) {
      const ms = toMonthStartDate(filterMonth);
      if (ms) q = q.eq("month", ms);
    }

    const { data, error } = await q;

    setLoading(false);

    if (error) {
      // fallback sem join
      const { data: data2, error: error2 } = await supabase
        .from("invoices")
        .select(
          "id,client_id,month,orders_count,gross_cents,wavie_fee_cents,status,created_at,updated_at"
        )
        .order("month", { ascending: false });

      if (error2) {
        setErr(error2.message);
        setRows([]);
        return;
      }

      setRows((data2 ?? []) as any);
      return;
    }

    setRows((data ?? []) as any);
  }

  useEffect(() => {
    if (!checking) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  async function updateStatus(id: string, status: InvoiceStatus) {
    setErr(null);

    const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  const canGenerate = useMemo(() => {
    return genClientSlug.trim().length >= 2 && genMonth.length === 7;
  }, [genClientSlug, genMonth]);

  async function generate() {
    setGenMsg(null);
    setErr(null);

    if (!canGenerate) {
      setGenMsg("Preencha um slug e um mês válido (YYYY-MM).");
      return;
    }

    const monthStart = toMonthStartDate(genMonth);
    if (!monthStart) {
      setGenMsg("Mês inválido.");
      return;
    }

    setGenerating(true);

    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id")
      .eq("slug", genClientSlug.trim())
      .maybeSingle<{ id: string }>();

    if (cErr || !client?.id) {
      setGenerating(false);
      setGenMsg("Não achei esse cliente (slug). Confirme se existe em /wavie/clientes.");
      return;
    }

    const { data, error } = await supabase.rpc("generate_invoice_for_month", {
      p_client_id: client.id,
      p_month: monthStart,
    });

    setGenerating(false);

    if (error) {
      setGenMsg(error.message);
      return;
    }

    setGenMsg(
      `OK! Invoice gerada/atualizada. status=${data?.status ?? "open"} • fee=${formatBRLFromCents(
        Number(data?.wavie_fee_cents ?? 0)
      )}`
    );

    await load();
  }

  function exportCsv() {
    const url = filterMonth
      ? `/wavie/reports/invoices/monthly?month=${filterMonth}`
      : `/wavie/reports/invoices/monthly`;
    window.open(url, "_blank");
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
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Faturas</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Gerar e acompanhar invoices por cliente/mês (somente Wavie Admin).
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

      {/* Gerar invoice */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Gerar/atualizar fatura do mês</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Usa a RPC <span className="font-mono">generate_invoice_for_month</span>. O cliente é encontrado pelo{" "}
          <span className="font-mono">clients.slug</span>.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Slug do cliente</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={genClientSlug}
              onChange={(e) => setGenClientSlug(e.target.value)}
              placeholder="ex: nelsaodrinks"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Mês</label>
            <input
              type="month"
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={genMonth}
              onChange={(e) => setGenMonth(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={generate}
              disabled={!canGenerate || generating}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {generating ? "Gerando…" : "Gerar/Atualizar"}
            </button>
          </div>
        </div>

        {genMsg ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
            {genMsg}
          </div>
        ) : null}
      </section>

      {/* Filtros + Lista */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-start justify-between gap-4 w-full">
            <div>
              <h2 className="text-base font-semibold">Lista de faturas</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Você pode filtrar por mês e status.
              </p>
            </div>

            <button
              onClick={exportCsv}
              className="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Exportar CSV
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Mês</label>
              <input
                type="month"
                className="mt-1 w-44 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700">Status</label>
              <select
                className="mt-1 w-44 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="open">open</option>
                <option value="sent">sent</option>
                <option value="paid">paid</option>
                <option value="void">void</option>
              </select>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="h-10 self-end rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900 disabled:opacity-60"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
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
                <th className="px-3 py-2 text-left font-medium">Mês</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Pedidos</th>
                <th className="px-3 py-2 text-left font-medium">Bruto</th>
                <th className="px-3 py-2 text-left font-medium">Taxa Wavie</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-neutral-500">
                    {loading ? "Carregando…" : "Nenhuma fatura encontrada."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const mk = monthKeyFromDateString(r.month);
                  const clientName = r.clients?.name || r.client_id.slice(0, 8);
                  const clientSlug = r.clients?.slug ? `(${r.clients.slug})` : "";

                  return (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2 font-medium text-neutral-900">{mk}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{clientName}</div>
                        <div className="text-xs text-neutral-500">
                          {clientSlug} {r.clients?.service_type ? `• ${r.clients.service_type}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{r.orders_count}</td>
                      <td className="px-3 py-2 text-neutral-700">{formatBRLFromCents(r.gross_cents)}</td>
                      <td className="px-3 py-2 text-neutral-900 font-medium">
                        {formatBRLFromCents(r.wavie_fee_cents)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => updateStatus(r.id, "sent")}
                            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs hover:border-neutral-900"
                          >
                            marcar sent
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, "paid")}
                            className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white"
                          >
                            marcar paid
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, "void")}
                            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs hover:border-neutral-900"
                          >
                            void
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Observação: a fatura congela os valores. Se novos pedidos entrarem no mês, gere/atualize novamente para refletir.
        </p>
      </section>
    </main>
  );
}
