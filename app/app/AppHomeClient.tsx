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
      <span className="text-white/85">Local:</span>
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

function minutesSince(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function AgeBadge({ mins }: { mins: number }) {
  // thresholds simples e efetivos
  const tone =
    mins >= 25 ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
    : mins >= 12 ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";

  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold", tone].join(" ")}>
      ⏱ {mins} min
    </span>
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
  const mins = minutesSince(p.created_at);

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AgeBadge mins={mins} />
            <Pill tone={status}>{status}</Pill>
          </div>
          <div className="mt-1 text-[11px] text-white/45">
            <span className="text-white/60">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>

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

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={[
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
        "border-white/10 bg-white/6 text-white/80 hover:bg-white/10 hover:border-white/20",
      ].join(" ")}
      aria-pressed={value}
    >
      <span className={["h-2.5 w-2.5 rounded-full", value ? "bg-emerald-400" : "bg-white/25"].join(" ")} />
      {label}
    </button>
  );
}

// Som via WebAudio (sem assets externos)
function beep(kind: "new" | "ready") {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as any;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    // "new": tom mais agudo curto; "ready": tom mais grave/cheio
    const freq = kind === "new" ? 880 : 520;

    o.type = "sine";
    o.frequency.value = freq;

    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);

    const now = ctx.currentTime;
    // ataque
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    // release
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "new" ? 0.14 : 0.22));

    o.start(now);
    o.stop(now + (kind === "new" ? 0.16 : 0.25));

    o.onended = () => {
      try { ctx.close(); } catch {}
    };
  } catch {}
}

function vibrate(pattern: number | number[]) {
  try {
    if (navigator?.vibrate) navigator.vibrate(pattern);
  } catch {}
}

export default function AppHomeClient() {
  const [barracaId, setBarracaId] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // PRO: alertas
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  // PRO: entregue compacto
  const [showAllDelivered, setShowAllDelivered] = useState(false);

  const stopPollingRef = useRef(false);
  const lastHash = useRef("");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<Map<string, Tone>>(new Map());
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

  function markNewAndTransitions(arr: PedidoRow[]) {
    const seen = seenIdsRef.current;
    const prevStatus = prevStatusRef.current;

    let hasNewRecebido = false;
    let hasTurnedPronto = false;

    const newly = new Set<string>();

    for (const p of arr) {
      const tone = normalizeStatus(p.status);

      if (!seen.has(p.id)) {
        newly.add(p.id);
        if (tone === "recebido") hasNewRecebido = true;
      } else {
        const prev = prevStatus.get(p.id);
        if (prev && prev !== tone && tone === "pronto") {
          hasTurnedPronto = true;
        }
      }

      prevStatus.set(p.id, tone);
    }

    // atualiza seen
    for (const p of arr) seen.add(p.id);

    if (newly.size > 0) {
      setNewIds((prev) => {
        const merged = new Set(prev);
        for (const id of newly) merged.add(id);
        return merged;
      });

      window.setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const id of newly) next.delete(id);
          return next;
        });
      }, 12000);
    }

    // alertas (opcionais)
    if (alertsEnabled) {
      if (hasNewRecebido) {
        beep("new");
        vibrate([60, 40, 60]);
      } else if (hasTurnedPronto) {
        beep("ready");
        vibrate([120]);
      }
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

    markNewAndTransitions(next);

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
  }, [barracaId, alertsEnabled]);

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

    const sortByNew = (a: PedidoRow, b: PedidoRow) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    return {
      recebido: rec.sort(sortByNew),
      preparando: prep.sort(sortByNew),
      pronto: pronto.sort(sortByNew),
      entregue: ent.sort(sortByNew),
    };
  }, [pedidos]);

  const deliveredToShow = useMemo(() => {
    if (showAllDelivered) return grouped.entregue;
    return grouped.entregue.slice(0, 5);
  }, [grouped.entregue, showAllDelivered]);

  if (!barracaId) {
    return (
      <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">
        Nenhuma barraca conectada pela URL.
      </div>
    );
  }

  const Column = ({
    tone,
    title,
    items,
    compactFooter,
  }: {
    tone: Tone;
    title: string;
    items: PedidoRow[];
    compactFooter?: React.ReactNode;
  }) => {
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

        {compactFooter ? <div className="mt-4">{compactFooter}</div> : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra de controles (Operação PRO) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-white/50">
          Atualiza a cada <span className="text-white/80 font-semibold">20s</span> •
          Alertas opcionais para cozinha/garçom.
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            label="Som/Vibração"
            value={alertsEnabled}
            onChange={(v) => {
              setAlertsEnabled(v);
              // “primeiro toque” desbloqueia áudio em alguns navegadores
              if (v) beep("new");
            }}
          />
        </div>
      </div>

      {/* MOBILE/TABLET: Pronto no topo e “sticky” */}
      <div className="lg:hidden">
        <div className="sticky top-2 z-20">
          <Column tone="pronto" title="Pronto" items={grouped.pronto} />
        </div>

        <div className="mt-4 space-y-4">
          <Column tone="recebido" title="Recebido" items={grouped.recebido} />
          <Column tone="preparando" title="Preparando" items={grouped.preparando} />
          <Column
            tone="entregue"
            title="Entregue"
            items={deliveredToShow}
            compactFooter={
              grouped.entregue.length > 5 ? (
                <button
                  onClick={() => setShowAllDelivered((v) => !v)}
                  className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:border-white/20"
                >
                  {showAllDelivered ? "Ver menos" : `Ver mais (${grouped.entregue.length - 5})`}
                </button>
              ) : null
            }
          />
        </div>
      </div>

      {/* DESKTOP: 4 colunas */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
        <Column tone="recebido" title="Recebido" items={grouped.recebido} />
        <Column tone="preparando" title="Preparando" items={grouped.preparando} />
        <Column tone="pronto" title="Pronto" items={grouped.pronto} />
        <Column
          tone="entregue"
          title="Entregue"
          items={deliveredToShow}
          compactFooter={
            grouped.entregue.length > 5 ? (
              <button
                onClick={() => setShowAllDelivered((v) => !v)}
                className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:border-white/20"
              >
                {showAllDelivered ? "Ver menos" : `Ver mais (${grouped.entregue.length - 5})`}
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
