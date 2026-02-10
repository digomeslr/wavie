// app/app/AppHomeClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type PedidoRow = {
  id: string;
  status: "recebido" | "preparando" | "pronto" | "entregue" | string;
  local: string | null;
  total: number | null;
  created_at: string;
  barraca_id: string;
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="wavie-card p-4">
      <div className="text-xs text-[color:var(--text-2)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status?.toLowerCase?.() ?? "—";
  return (
    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-xs text-[color:var(--text-2)]">
      {label}
    </span>
  );
}

function formatMoneyBRL(v: number | null | undefined) {
  if (v == null) return "—";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function EmptyOrders() {
  return (
    <div className="wavie-card p-6">
      <div className="text-sm font-semibold">Pedidos</div>
      <div className="mt-1 text-sm text-[color:var(--text-2)]">
        Nenhum pedido no momento.
      </div>

      <div className="mt-4 wavie-card-soft p-4 text-sm text-[color:var(--text-2)]">
        Este painel é{" "}
        <strong className="text-[color:var(--text)]">operacional</strong>. Quando
        um pedido entrar, ele aparecerá aqui em tempo real, com{" "}
        <strong className="text-[color:var(--text)]">itens sempre visíveis</strong>
        , status claro e ações rápidas.
        <div className="mt-2 text-xs text-[color:var(--muted)]">
          Otimizado para uso contínuo em celular e tablet.
        </div>
      </div>
    </div>
  );
}

function OrdersList({ pedidos }: { pedidos: PedidoRow[] }) {
  return (
    <div className="wavie-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Pedidos</div>
          <div className="mt-1 text-sm text-[color:var(--text-2)]">
            Últimos pedidos (TEST).
          </div>
        </div>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text-2)]">
          {pedidos.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {pedidos.map((p) => (
          <div key={p.id} className="wavie-card-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  Pedido #{p.id.slice(0, 6).toUpperCase()}
                </div>
                <StatusPill status={p.status} />
              </div>

              <div className="text-sm text-[color:var(--text)]">
                {formatMoneyBRL(p.total)}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-4 text-xs text-[color:var(--muted)]">
              <span>
                Local:{" "}
                <span className="text-[color:var(--text-2)]">
                  {p.local ?? "—"}
                </span>
              </span>
              <span>
                Criado:{" "}
                <span className="text-[color:var(--text-2)]">
                  {new Date(p.created_at).toLocaleString("pt-BR")}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppHomeClient({ barracaId }: { barracaId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);

  const pedidosHoje = useMemo(() => {
    const now = new Date();
    return pedidos.filter((p) => {
      const dt = new Date(p.created_at);
      return (
        dt.getFullYear() === now.getFullYear() &&
        dt.getMonth() === now.getMonth() &&
        dt.getDate() === now.getDate()
      );
    }).length;
  }, [pedidos]);

  const faturamentoHoje = useMemo(() => {
    const now = new Date();
    return pedidos.reduce((acc, p) => {
      const dt = new Date(p.created_at);
      const isToday =
        dt.getFullYear() === now.getFullYear() &&
        dt.getMonth() === now.getMonth() &&
        dt.getDate() === now.getDate();
      return acc + (isToday ? Number(p.total ?? 0) : 0);
    }, 0);
  }, [pedidos]);

  const ticketMedioHoje = useMemo(() => {
    if (pedidosHoje === 0) return null;
    return faturamentoHoje / pedidosHoje;
  }, [faturamentoHoje, pedidosHoje]);

  const emPreparo = useMemo(() => {
    return pedidos.filter((p) => (p.status ?? "").toLowerCase() === "preparando")
      .length;
  }, [pedidos]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErrorMsg(null);

      if (!barracaId) {
        setPedidos([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(
          `/api/app/pedidos?barraca_id=${encodeURIComponent(barracaId)}&limit=20`,
          { cache: "no-store" }
        );

        const json = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setErrorMsg(json?.error ?? "Erro ao carregar pedidos");
          setPedidos([]);
        } else {
          setPedidos((json?.data ?? []) as PedidoRow[]);
        }
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(e?.message ?? "Erro de rede");
        setPedidos([]);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [barracaId]);

  return (
    <div className="space-y-6">
      <div className="text-xs text-[color:var(--muted)]">
        barracaId: <span className="text-[color:var(--text-2)]">{barracaId ?? "null"}</span>
      </div>  
      <div>
        <div className="text-xl font-semibold tracking-tight">Visão geral</div>
        <div className="mt-1 text-sm text-[color:var(--text-2)]">
          Operação e indicadores do dia (ambiente TEST).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pedidos hoje" value={barracaId ? String(pedidosHoje) : "—"} />
        <StatCard
          label="Faturamento hoje"
          value={barracaId ? formatMoneyBRL(faturamentoHoje) : "—"}
        />
        <StatCard
          label="Ticket médio"
          value={barracaId ? formatMoneyBRL(ticketMedioHoje ?? null) : "—"}
        />
        <StatCard label="Em preparo" value={barracaId ? String(emPreparo) : "—"} />
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href="/app/billing"
          className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
        >
          Ver cobrança
        </a>

        <a
          href="/b/nelsaodrinks"
          className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
        >
          Abrir cardápio (nelsaodrinks)
        </a>
      </div>

      {!barracaId ? (
        <div className="wavie-card p-6">
          <div className="text-sm font-semibold">Conectar barraca</div>
          <div className="mt-3 text-xs text-[color:var(--muted)]">
          Abra /app/barraca/{"<barraca_id>"} para carregar pedidos.
          </div>
        </div>
      ) : loading ? (
        <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">
          Carregando pedidos…
        </div>
      ) : errorMsg ? (
        <div className="wavie-card p-6">
          <div className="text-sm font-semibold text-[color:var(--text)]">
            Não foi possível carregar pedidos
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-2)]">{errorMsg}</div>
        </div>
      ) : pedidos.length === 0 ? (
        <EmptyOrders />
      ) : (
        <OrdersList pedidos={pedidos} />
      )}
    </div>
  );
}
