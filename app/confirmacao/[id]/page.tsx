"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PedidoRow = {
  id: string;
  status: string | null;
  local: string | null;
  total: number | null;
  created_at: string | null;
  barraca_id: string | null;
  itens_pedido: {
    quantidade: number;
    preco_unitario: number | null;
    produtos: { nome: string } | null;
  }[];
};

const FALLBACK_BARRACA_ID = "9f56ce53-1ec1-4e03-ae4c-64b2b2085e95";

function brl(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function statusLabel(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "recebido") return "Recebido";
  if (s === "preparando") return "Preparando";
  if (s === "pronto") return "Pronto";
  if (s === "entregue") return "Entregue";
  if (s === "cancelado") return "Cancelado";
  return status || "—";
}

function statusPill(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "recebido") return "bg-slate-100 text-slate-900 border-slate-200";
  if (s === "preparando") return "bg-amber-100 text-amber-900 border-amber-200";
  if (s === "pronto") return "bg-sky-100 text-sky-900 border-sky-200";
  if (s === "entregue") return "bg-emerald-100 text-emerald-900 border-emerald-200";
  if (s === "cancelado") return "bg-rose-100 text-rose-900 border-rose-200";
  return "bg-slate-100 text-slate-900 border-slate-200";
}

export default function ConfirmacaoPage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const pedidoId = params?.id;
  const bFromUrl = sp.get("b");

  const [loading, setLoading] = useState(true);
  const [pedido, setPedido] = useState<PedidoRow | null>(null);

  const barracaId = useMemo(() => {
    // prioridade: b= na URL -> pedido.barraca_id -> localStorage -> fallback
    if (bFromUrl) return bFromUrl;
    if (pedido?.barraca_id) return pedido.barraca_id;
    try {
      return localStorage.getItem("praiapay_barraca_id") || FALLBACK_BARRACA_ID;
    } catch {
      return FALLBACK_BARRACA_ID;
    }
  }, [bFromUrl, pedido?.barraca_id]);

  async function load() {
    if (!pedidoId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
        id,
        status,
        local,
        total,
        created_at,
        barraca_id,
        itens_pedido (
          quantidade,
          preco_unitario,
          produtos ( nome )
        )
      `
      )
      .eq("id", pedidoId)
      .single();

    if (!error && data) setPedido(data as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // atualiza status automaticamente
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  const itens = pedido?.itens_pedido || [];

  const totalCalc = useMemo(() => {
    const t = itens.reduce((s, it) => {
      const unit = Number(it.preco_unitario || 0);
      return s + unit * Number(it.quantidade || 0);
    }, 0);
    return Number(pedido?.total ?? t);
  }, [itens, pedido?.total]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 md:p-6 pb-10">
        <header className="mb-5">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pedido confirmado</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Acompanhe o status — atualiza automaticamente
          </p>
        </header>

        {loading ? (
          <div className="text-slate-500">Carregando…</div>
        ) : !pedido ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-slate-600">
            Não encontramos esse pedido.
          </div>
        ) : (
          <>
            {/* Card principal */}
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Pedido
                  </div>
                  <div className="mt-1 text-3xl font-bold tracking-tight">
                    #{shortId(pedido.id)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${statusPill(
                      pedido.status || ""
                    )}`}
                  >
                    {statusLabel(pedido.status || "")}
                  </span>
                  <div className="mt-2 text-xs text-slate-400">
                    {pedido.created_at
                      ? new Date(pedido.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Local
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {pedido.local ? pedido.local : "Sem local informado"}
                </div>
              </div>
            </section>

            {/* Itens */}
            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Itens</h2>
                <div className="text-sm text-slate-500">{itens.length} item(ns)</div>
              </div>

              {itens.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-slate-600">
                  Nenhum item encontrado neste pedido.
                </div>
              ) : (
                <div className="space-y-3">
                  {itens.map((it, idx) => {
                    const unit = Number(it.preco_unitario || 0);
                    const qtd = Number(it.quantidade || 0);
                    const subtotal = unit * qtd;

                    return (
                      <article
                        key={idx}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-lg font-semibold text-slate-900 truncate">
                              {it.produtos?.nome || "Item"}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {qtd}x • {brl(unit)} cada
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {brl(subtotal)}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Total + ações */}
            <section className="mt-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500">Total</div>
                  <div className="text-2xl font-bold text-slate-900">{brl(totalCalc)}</div>
                </div>

                <Link
                  href={`/menu?b=${encodeURIComponent(barracaId)}`}
                  className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-semibold"
                >
                  Voltar ao menu
                </Link>
              </div>

              <p className="mt-3 text-sm text-slate-500">
                Se quiser, você pode fazer outro pedido — ele entra na mesma fila.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
