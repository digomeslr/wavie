"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PedidoItem = { name: string; quantity: number };

type PedidoRow = {
  id: string;
  status: "recebido" | "preparando" | "pronto" | "entregue" | string;
  local: string | null;
  created_at: string;
  barraca_id: string;
  items?: PedidoItem[];
};

function resolveBarracaId(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const q = url.searchParams.get("barraca_id");
  if (q && q.length >= 8) return q;

  const parts = url.pathname.split("/").filter(Boolean);

  // /app/barraca/<id>
  const idxBarraca = parts.indexOf("barraca");
  if (idxBarraca >= 0 && parts[idxBarraca + 1]) return parts[idxBarraca + 1];

  // /app/<id>
  const idxApp = parts.indexOf("app");
  if (idxApp >= 0 && parts[idxApp + 1]) return parts[idxApp + 1];

  return null;
}

function normalizeStatus(s: string | null | undefined) {
  const x = (s ?? "").toLowerCase().trim();
  if (x === "preparando") return "preparando";
  if (x === "pronto") return "pronto";
  if (x === "entregue") return "entregue";
  return "recebido";
}

const NEXT: Record<string, string | null> = {
  recebido: "preparando",
  preparando: "pronto",
  pronto: "entregue",
  entregue: null,
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/80">
      {children}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "mt-3 inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold",
        "border-white/10 bg-white/6 text-white/90",
        "hover:bg-white/10 hover:border-white/20 active:scale-[0.99]",
        "focus:outline-none focus:ring-2 focus:ring-white/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function QtyChip({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
      {n}x
    </span>
  );
}

function OrderItems({ items }: { items?: PedidoItem[] }) {
  if (!items || items.length === 0) {
    return <div className="mt-3 text-xs text-white/40">Itens: —</div>;
  }

  const max = 5;
  const head = items.slice(0, max);

  return (
    <div className="mt-3 space-y-1.5 text-xs">
      {head.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <QtyChip n={item.quantity} />
          <div className="min-w-0 truncate text-white/90">{item.name}</div>
        </div>
      ))}
      {items.length > max ? (
        <div className="text-white/40">+ {items.length - max} itens</div>
      ) : null}
    </div>
  );
}

function OrderCard({
  p,
  onAdvance,
  busy,
}: {
  p: PedidoRow;
  onAdvance: (id: string, current: string) => void;
  busy: boolean;
}) {
  const status = normalizeStatus(p.status);
  const next = NEXT[status];

  const buttonLabel =
    status === "recebido"
      ? "Iniciar preparo"
      : status === "preparando"
      ? "Marcar pronto"
      : status === "pronto"
      ? "Marcar entregue"
      : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-white">
            Pedido <span className="text-white/70">#{p.id.slice(0, 6).toUpperCase()}</span>
          </div>
          <div className="mt-1 text-[11px] text-white/45">
            Local <span className="text-white/70">{p.local ?? "—"}</span> •{" "}
            <span className="text-white/60">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
          </div>
        </div>
        <Pill>{status}</Pill>
      </div>

      <OrderItems items={p.items} />

      {next ? (
        <ActionButton
          label={buttonLabel}
          onClick={() => onAdvance(p.id, status)}
          disabled={busy}
        />
      ) : null}
    </div>
  );
}

export default function AppHomeClient() {
  const [barracaId, setBarracaId] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lastHash = useRef("");
  const stopPollingRef = useRef(false);

  useEffect(() => {
    setBarracaId(resolveBarracaId());

    const onPop = () => setBarracaId(resolveBarracaId());
    window.addEventListener("popstate", onPop);

    const onVis = () => {
      stopPollingRef.current = document.visibilityState !== "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function load() {
    if (!barracaId) return;

    const res = await fetch(
      `/api/app/pedidos?barraca_id=${encodeURIComponent(barracaId)}&limit=50`,
      { cache: "no-store" }
    );
    const json = await res.json();
    const next = (json?.data ?? []) as PedidoRow[];

    // evita re-render desnecessário
    const hash = JSON.stringify(next);
    if (hash !== lastHash.current) {
      lastHash.current = hash;
      setPedidos(next);
    }
  }

  useEffect(() => {
    if (!barracaId) return;

    load();
    const t = setInterval(() => {
      if (!stopPollingRef.current) load();
    }, 20000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barracaId]);

  async function advanceStatus(id: string, current: string) {
    const next = NEXT[current];
    if (!next) return;

    setBusyId(id);

    // otimista
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: next } : p)));

    try {
      const res = await fetch(`/api/app/pedidos/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_status: next }),
      });

      const json = await res.json();

      if (!res.ok) {
        // rollback
        setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: current } : p)));
        alert(json?.error ?? "Erro ao atualizar status");
      } else {
        const updated = json?.data as PedidoRow;
        if (updated?.id) {
          setPedidos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: updated.status } : p))
          );
        }
      }
    } catch (e: any) {
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: current } : p)));
      alert(e?.message ?? "Erro de rede");
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    const rec: PedidoRow[] = [];
    const prep: PedidoRow[] = [];
    const pronto: PedidoRow[] = [];
    const ent: PedidoRow[] = [];

    for (const p of pedidos) {
      const s = normalizeStatus(p.status);
      if (s === "preparando") prep.push(p);
      else if (s === "pronto") pronto.push(p);
      else if (s === "entregue") ent.push(p);
      else rec.push(p);
    }

    // novo em cima sempre
    const sortByNew = (a: PedidoRow, b: PedidoRow) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    return {
      recebido: rec.sort(sortByNew),
      preparando: prep.sort(sortByNew),
      pronto: pronto.sort(sortByNew),
      entregue: ent.sort(sortByNew),
    };
  }, [pedidos]);

  if (!barracaId) {
    return (
      <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">
        Nenhuma barraca conectada pela URL.
      </div>
    );
  }

  const Column = ({ title, items }: { title: string; items: PedidoRow[] }) => (
    <div className="wavie-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-[color:var(--text)]">{title}</div>
        <Pill>{items.length}</Pill>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="wavie-card-soft p-4 text-xs text-[color:var(--muted)]">
            Sem pedidos aqui ainda.
          </div>
        ) : (
          items.map((p) => (
            <OrderCard
              key={p.id}
              p={p}
              onAdvance={advanceStatus}
              busy={busyId === p.id}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Column title="Recebido" items={grouped.recebido} />
      <Column title="Preparando" items={grouped.preparando} />
      <Column title="Pronto" items={grouped.pronto} />
      <Column title="Entregue" items={grouped.entregue} />
    </div>
  );
}
