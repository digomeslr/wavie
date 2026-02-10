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

  const idxBarraca = parts.indexOf("barraca");
  if (idxBarraca >= 0 && parts[idxBarraca + 1]) return parts[idxBarraca + 1];

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

type Tone = "recebido" | "preparando" | "pronto" | "entregue";

function toneClasses(tone: Tone) {
  // “Acento” discreto, mas bem visível
  if (tone === "recebido") {
    return {
      col: "ring-1 ring-white/6",
      card: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_40px_rgba(59,130,246,0.08)]",
      edge: "before:bg-sky-400/60",
      pill: "border-sky-400/20 bg-sky-400/10 text-sky-200",
      btn: "border-sky-400/25 bg-sky-400/15 hover:bg-sky-400/20",
      chip: "border-sky-400/20 bg-sky-400/10 text-sky-100",
      title: "text-sky-200",
    };
  }
  if (tone === "preparando") {
    return {
      col: "ring-1 ring-white/6",
      card: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_40px_rgba(245,158,11,0.08)]",
      edge: "before:bg-amber-400/60",
      pill: "border-amber-400/20 bg-amber-400/10 text-amber-200",
      btn: "border-amber-400/25 bg-amber-400/15 hover:bg-amber-400/20",
      chip: "border-amber-400/20 bg-amber-400/10 text-amber-100",
      title: "text-amber-200",
    };
  }
  if (tone === "pronto") {
    return {
      col: "ring-1 ring-white/6",
      card: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_40px_rgba(34,197,94,0.10)]",
      edge: "before:bg-emerald-400/70",
      pill: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      btn: "border-emerald-400/30 bg-emerald-400/18 hover:bg-emerald-400/24",
      chip: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
      title: "text-emerald-200",
    };
  }
  // entregue
  return {
    col: "ring-1 ring-white/6",
    card: "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
    edge: "before:bg-white/20",
    pill: "border-white/10 bg-white/5 text-white/70",
    btn: "border-white/10 bg-white/6 hover:bg-white/10",
    chip: "border-white/10 bg-white/8 text-white/70",
    title: "text-white/85",
  };
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = toneClasses(tone);
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
        t.pill,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function ActionButton({
  tone,
  label,
  onClick,
  disabled,
}: {
  tone: Tone;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = toneClasses(tone);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "mt-3 inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold",
        "text-white/90 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-white/10",
        t.btn,
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function QtyChip({ tone, n }: { tone: Tone; n: number }) {
  const t = toneClasses(tone);
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
        t.chip,
      ].join(" ")}
    >
      {n}x
    </span>
  );
}

function OrderItems({ tone, items }: { tone: Tone; items?: PedidoItem[] }) {
  if (!items || items.length === 0) {
    return <div className="mt-3 text-xs text-white/40">Itens: —</div>;
  }

  const max = 5;
  const head = items.slice(0, max);

  return (
    <div className="mt-3 space-y-1.5 text-xs">
      {head.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <QtyChip tone={tone} n={item.quantity} />
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
  onAdvance: (id: string, current: Tone) => void;
  busy: boolean;
}) {
  const status = normalizeStatus(p.status) as Tone;
  const next = NEXT[status];

  const t = toneClasses(status);

  const buttonLabel =
    status === "recebido"
      ? "Iniciar preparo"
      : status === "preparando"
      ? "Marcar pronto"
      : status === "pronto"
      ? "Marcar entregue"
      : "";

  return (
    <div
      className={[
        "relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-4",
        t.card,
        "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full",
        t.edge,
      ].join(" ")}
    >
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
        <Pill tone={status}>{status}</Pill>
      </div>

      <OrderItems tone={status} items={p.items} />

      {next ? (
        <ActionButton
          tone={status}
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

  async function advanceStatus(id: string, current: Tone) {
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
        setPedidos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: current } : p))
        );
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
      setPedidos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: current } : p))
      );
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

  const Column = ({ tone, title, items }: { tone: Tone; title: string; items: PedidoRow[] }) => {
    const t = toneClasses(tone);
    return (
      <div className={["wavie-card p-4", t.col].join(" ")}>
        <div className="mb-3 flex items-center justify-between">
          <div className={["text-sm font-semibold", t.title].join(" ")}>{title}</div>
          <Pill tone={tone}>{items.length}</Pill>
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
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Column tone="recebido" title="Recebido" items={grouped.recebido} />
      <Column tone="preparando" title="Preparando" items={grouped.preparando} />
      <Column tone="pronto" title="Pronto" items={grouped.pronto} />
      <Column tone="entregue" title="Entregue" items={grouped.entregue} />
    </div>
  );
}
