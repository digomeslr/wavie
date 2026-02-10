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

type Tone = "recebido" | "preparando" | "pronto" | "entregue";

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

function normalizeStatus(s: string | null | undefined): Tone {
  const x = (s ?? "").toLowerCase().trim();
  if (x === "preparando") return "preparando";
  if (x === "pronto") return "pronto";
  if (x === "entregue") return "entregue";
  return "recebido";
}

const NEXT: Record<Tone, Tone | null> = {
  recebido: "preparando",
  preparando: "pronto",
  pronto: "entregue",
  entregue: null,
};

function toneClasses(tone: Tone) {
  // “vida” + contraste: gradiente leve, glow e UI mais chamativa
  if (tone === "recebido") {
    return {
      colTitle: "text-sky-200",
      colGlow: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(56,189,248,0.10)]",
      edge: "before:bg-sky-400/70",
      pill: "border-sky-400/25 bg-sky-400/12 text-sky-200",
      chip: "border-sky-400/25 bg-sky-400/12 text-sky-100",
      local: "border-sky-400/25 bg-sky-400/12 text-sky-100",
      btn: "border-sky-400/30 bg-sky-400/18 hover:bg-sky-400/24 hover:border-sky-400/40",
      cardBg: "from-sky-500/10 to-white/4",
    };
  }
  if (tone === "preparando") {
    return {
      colTitle: "text-amber-200",
      colGlow: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(245,158,11,0.10)]",
      edge: "before:bg-amber-400/70",
      pill: "border-amber-400/25 bg-amber-400/12 text-amber-200",
      chip: "border-amber-400/25 bg-amber-400/12 text-amber-100",
      local: "border-amber-400/25 bg-amber-400/12 text-amber-100",
      btn: "border-amber-400/30 bg-amber-400/18 hover:bg-amber-400/24 hover:border-amber-400/40",
      cardBg: "from-amber-500/10 to-white/4",
    };
  }
  if (tone === "pronto") {
    return {
      colTitle: "text-emerald-200",
      colGlow: "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_70px_rgba(34,197,94,0.12)]",
      edge: "before:bg-emerald-400/80",
      pill: "border-emerald-400/25 bg-emerald-400/12 text-emerald-200",
      chip: "border-emerald-400/25 bg-emerald-400/12 text-emerald-100",
      local: "border-emerald-400/25 bg-emerald-400/12 text-emerald-100",
      btn: "border-emerald-400/35 bg-emerald-400/20 hover:bg-emerald-400/26 hover:border-emerald-400/45",
      cardBg: "from-emerald-500/12 to-white/4",
    };
  }
  // entregue
  return {
    colTitle: "text-white/85",
    colGlow: "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
    edge: "before:bg-white/20",
    pill: "border-white/10 bg-white/6 text-white/70",
    chip: "border-white/10 bg-white/8 text-white/70",
    local: "border-white/10 bg-white/8 text-white/70",
    btn: "border-white/10 bg-white/6 hover:bg-white/10 hover:border-white/20",
    cardBg: "from-white/8 to-white/4",
  };
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = toneClasses(tone);
  return (
    <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium", t.pill].join(" ")}>
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
        "text-white/95 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-white/10",
        "shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
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
    <span className={["inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", t.chip].join(" ")}>
      {n}x
    </span>
  );
}

function LocalBadge({ tone, local }: { tone: Tone; local: string | null }) {
  const t = toneClasses(tone);
  const text = local?.trim() ? local.trim() : "—";

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5",
        "text-[12px] font-semibold tracking-tight",
        t.local,
      ].join(" ")}
      title="Local de entrega"
    >
      <span className="text-white/80">📍</span>
      <span className="text-white/90">Local:</span>
      <span className="text-white">{text}</span>
    </div>
  );
}

function OrderItems({ tone, items }: { tone: Tone; items?: PedidoItem[] }) {
  if (!items || items.length === 0) {
    return <div className="mt-3 text-xs text-white/40">Itens: —</div>;
  }

  const max = 6;
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
  isNew,
}: {
  p: PedidoRow;
  onAdvance: (id: string, current: Tone) => void;
  busy: boolean;
  isNew: boolean;
}) {
  const status = normalizeStatus(p.status);
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
        "relative rounded-2xl border border-white/10 bg-gradient-to-b p-4",
        t.cardBg,
        t.colGlow,
        "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full",
        t.edge,
        isNew ? "ring-2 ring-sky-300/25 animate-[pulse_1.2s_ease-in-out_3]" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-white">
            Pedido <span className="text-white/70">#{p.id.slice(0, 6).toUpperCase()}</span>
          </div>
          <div className="mt-1 text-[11px] text-white/45">
            <span className="text-white/60">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
          </div>
        </div>
        <Pill tone={status}>{status}</Pill>
      </div>

      {/* LOCAL em destaque */}
      <div className="mt-3">
        <LocalBadge tone={status} local={p.local} />
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

  const stopPollingRef = useRef(false);
  const lastHash = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

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

  function markNew(arr: PedidoRow[]) {
    const seen = seenIdsRef.current;
    const newly = new Set<string>();

    for (const p of arr) {
      if (!seen.has(p.id)) newly.add(p.id);
    }

    // atualiza o seen
    for (const p of arr) seen.add(p.id);

    if (newly.size > 0) {
      setNewIds((prev) => {
        const merged = new Set(prev);
        for (const id of newly) merged.add(id);
        return merged;
      });

      // remove destaque depois de 12s (sem som)
      window.setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const id of newly) next.delete(id);
          return next;
        });
      }, 12000);
    }
  }

  async function load() {
    if (!barracaId) return;

    const res = await fetch(
      `/api/app/pedidos?barraca_id=${encodeURIComponent(barracaId)}&limit=50`,
      { cache: "no-store" }
    );
    const json = await res.json();
    const next = (json?.data ?? []) as PedidoRow[];

    // marca pedidos novos (antes do hash, pois hash pode mudar pouco)
    markNew(next);

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
        setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: current } : p)));
        alert(json?.error ?? "Erro ao atualizar status");
      } else {
        const updated = json?.data as PedidoRow;
        if (updated?.id) {
          setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: updated.status } : p)));
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
      <div className={["wavie-card p-4", t.colGlow].join(" ")}>
        <div className="mb-3 flex items-center justify-between">
          <div className={["text-sm font-semibold", t.colTitle].join(" ")}>{title}</div>
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
                isNew={newIds.has(p.id)}
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
