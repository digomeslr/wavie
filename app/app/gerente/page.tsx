"use client";

import { useEffect, useMemo, useState } from "react";

function resolveBarracaId(): string | null {
    if (typeof window === "undefined") return null;
  
    const url = new URL(window.location.href);
    const q = url.searchParams.get("barraca_id");
  
    // só aceita UUID válido (formato simples)
    if (q && /^[0-9a-fA-F-]{36}$/.test(q)) {
      return q;
    }
  
    return null;
  }
  
function formatMoneyBRL(v: number | null | undefined) {
  if (v == null) return "—";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

type Metrics = {
  pedidosHoje: number;
  faturamentoHoje: number;
  ticketMedio: number | null;

  sla: { green: number; yellow: number; red: number };
  slaPct: { green: number; yellow: number; red: number } | null;

  pedidosPorHora: Array<{ hour: number; count: number }>;
  peak: { hour: number; count: number };

  avgPrepMins: number | null;

  topProdutos: Array<{ name: string; qty: number }>;
  ultimosPedidos: Array<{ id: string; total: number | null; status: string; created_at: string; local: string | null }>;
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="wavie-card p-4">
      <div className="text-xs text-[color:var(--text-2)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div> : null}
    </div>
  );
}

function HourBar({ data }: { data: Array<{ hour: number; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="mt-3 space-y-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.hour} className="flex items-center gap-3">
            <div className="w-10 text-xs text-[color:var(--muted)]">{String(d.hour).padStart(2, "0")}h</div>
            <div className="flex-1">
              <div className="h-2 w-full rounded-full bg-white/5">
                <div className="h-2 rounded-full bg-white/20" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="w-10 text-right text-xs font-semibold text-[color:var(--text-2)]">{d.count}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function GerentePage() {
  const [barracaId, setBarracaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setBarracaId(resolveBarracaId());
  }, []);

  async function load() {
    if (!barracaId) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/app/gerente/metrics?barraca_id=${encodeURIComponent(barracaId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar métricas");
      setData(json?.data ?? null);
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!barracaId) return;
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barracaId]);

  const peakLabel = useMemo(() => {
    if (!data) return "—";
    const h = String(data.peak.hour).padStart(2, "0");
    return `${h}h (${data.peak.count})`;
  }, [data]);

  if (!barracaId) {
    return (
      <div className="wavie-card p-6">
        <div className="text-sm font-semibold text-[color:var(--text)]">Painel do Dono</div>
        <div className="mt-2 text-sm text-[color:var(--text-2)]">
          Acesse com <span className="font-semibold">/app/gerente?barraca_id=SEU_UUID</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold tracking-tight text-[color:var(--text)]">Painel do Dono</div>
          <div className="mt-1 text-sm text-[color:var(--text-2)]">
            Métricas do dia (TEST) • Atualiza a cada 30s
          </div>
        </div>

        <a href={`/app/barraca/${barracaId}`} className="wavie-btn">
          Voltar à operação
        </a>
      </div>

      {loading ? (
        <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">Carregando…</div>
      ) : err ? (
        <div className="wavie-card p-6">
          <div className="text-sm font-semibold text-[color:var(--text)]">Erro</div>
          <div className="mt-2 text-sm text-[color:var(--text-2)]">{err}</div>
        </div>
      ) : !data ? (
        <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">Sem dados.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pedidos hoje" value={String(data.pedidosHoje)} />
            <Stat label="Faturamento hoje" value={formatMoneyBRL(data.faturamentoHoje)} />
            <Stat label="Ticket médio" value={formatMoneyBRL(data.ticketMedio)} />
            <Stat
              label="Tempo médio (proxy)"
              value={data.avgPrepMins != null ? `${data.avgPrepMins} min` : "—"}
              hint="Pedidos prontos/entregues: agora − created_at"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="wavie-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[color:var(--text)]">SLA (10/20min)</div>
                {data.slaPct ? (
                  <div className="text-xs text-[color:var(--muted)]">
                    {data.slaPct.green}% verde • {data.slaPct.yellow}% amarelo • {data.slaPct.red}% vermelho
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-emerald-200">
                  Verde: {data.sla.green}
                </span>
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-amber-200">
                  Amarelo: {data.sla.yellow}
                </span>
                <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-rose-200">
                  Vermelho: {data.sla.red}
                </span>
              </div>
            </div>

            <div className="wavie-card p-5">
              <div className="text-sm font-semibold text-[color:var(--text)]">Pico do dia</div>
              <div className="mt-2 text-sm text-[color:var(--text-2)]">
                Horário com mais pedidos: <span className="font-semibold text-[color:var(--text)]">{peakLabel}</span>
              </div>

              <HourBar data={data.pedidosPorHora} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="wavie-card p-5">
              <div className="text-sm font-semibold text-[color:var(--text)]">Top produtos (hoje)</div>
              <div className="mt-3 space-y-2 text-sm">
                {data.topProdutos.length === 0 ? (
                  <div className="text-sm text-[color:var(--text-2)]">Sem itens ainda.</div>
                ) : (
                  data.topProdutos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-[color:var(--text)]">{p.name}</div>
                      <div className="text-[color:var(--text-2)] font-semibold">{p.qty}x</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="wavie-card p-5">
              <div className="text-sm font-semibold text-[color:var(--text)]">Últimos pedidos</div>
              <div className="mt-3 space-y-2">
                {data.ultimosPedidos.map((p) => (
                  <div key={p.id} className="wavie-card-soft p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[color:var(--text)]">
                          #{p.id.slice(0, 6).toUpperCase()}{" "}
                          <span className="text-xs font-medium text-[color:var(--muted)]">{p.status}</span>
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {new Date(p.created_at).toLocaleString("pt-BR")} • Local: {p.local ?? "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-[color:var(--text)]">
                        {formatMoneyBRL(p.total)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
