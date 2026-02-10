"use client";

import { useEffect, useMemo, useState } from "react";

type PedidoItem = {
  name?: string | null;
  title?: string | null;
  produto?: string | null;
  quantity?: number | null;
  qty?: number | null;
  unit_price?: number | null;
  price?: number | null;
  total?: number | null;
};

type PedidoRow = {
  id: string;
  status: "recebido" | "preparando" | "pronto" | "entregue" | string;
  local: string | null;
  total: number | null;
  created_at: string;
  barraca_id: string;
  items?: PedidoItem[] | null; // opcional (se o endpoint devolver)
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeStatus(s: string | null | undefined) {
  const x = (s ?? "").toLowerCase().trim();
  if (x === "recebido") return "recebido";
  if (x === "preparando" || x === "em_preparo" || x === "em preparo") return "preparando";
  if (x === "pronto") return "pronto";
  if (x === "entregue" || x === "finalizado") return "entregue";
  return "recebido";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
      : tone === "danger"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
      : "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text-2)]";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs", toneClass)}>
      {children}
    </span>
  );
}

function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="wavie-btn">
      {children}
    </a>
  );
}

function OrderItemsPreview({ items }: { items?: PedidoItem[] | null }) {
  const normalized = (items ?? [])
    .map((it) => {
      const name = it.name ?? it.title ?? it.produto ?? "Item";
      const qty = it.quantity ?? it.qty ?? 1;
      return { name, qty };
    })
    .filter((x) => x.name);

  if (!normalized.length) {
    return (
      <div className="mt-2 text-xs text-[color:var(--muted)]">
        Itens: <span className="text-[color:var(--text-2)]">—</span>
      </div>
    );
  }

  const max = 3;
  const head = normalized.slice(0, max);

  return (
    <div className="mt-2 space-y-1 text-xs">
      {head.map((it, idx) => (
        <div key={idx} className="flex items-center justify-between gap-3 text-[color:var(--text-2)]">
          <div className="min-w-0 truncate">
            <span className="text-[color:var(--muted)]">{it.qty}x</span>{" "}
            <span className="text-[color:var(--text)]">{it.name}</span>
          </div>
        </div>
      ))}
      {normalized.length > max ? (
        <div className="text-[color:var(--muted)]">+ {normalized.length - max} itens</div>
      ) : null}
    </div>
  );
}

function OrderCard({ p }: { p: PedidoRow }) {
  const status = normalizeStatus(p.status);
  const tone =
    status === "entregue" ? "ok" : status === "pronto" ? "warn" : status === "preparando" ? "danger" : "neutral";

  return (
    <div className="wavie-card-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[color:var(--text)]">
              Pedido #{p.id.slice(0, 6).toUpperCase()}
            </div>
            <Pill tone={tone}>{status}</Pill>
          </div>

          <div className="mt-2 flex flex-wrap gap-4 text-xs text-[color:var(--muted)]">
            <span>
              Local: <span className="text-[color:var(--text-2)]">{p.local ?? "—"}</span>
            </span>
            <span>
              Criado:{" "}
              <span className="text-[color:var(--text-2)]">{new Date(p.created_at).toLocaleString("pt-BR")}</span>
            </span>
          </div>

          <OrderItemsPreview items={p.items ?? null} />
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  title,
  subtitle,
  pedidos,
  empty,
}: {
  title: string;
  subtitle?: string;
  pedidos: PedidoRow[];
  empty?: string;
}) {
  return (
    <div className="wavie-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--text)]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-[color:var(--muted)]">{subtitle}</div> : null}
        </div>
        <Pill>{pedidos.length}</Pill>
      </div>

      <div className="mt-4 space-y-3">
        {pedidos.length === 0 ? (
          <div className="wavie-card-soft p-4 text-xs text-[color:var(--muted)]">{empty ?? "Sem pedidos aqui ainda."}</div>
        ) : (
          pedidos.map((p) => <OrderCard key={p.id} p={p} />)
        )}
      </div>
    </div>
  );
}

function parseBarracaIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);

  // 1) query: ?barraca_id=<uuid>
  const q = url.searchParams.get("barraca_id");
  if (q && q.length >= 8) return q;

  // 2) paths: /app/barraca/<uuid> OR /app/<uuid>
  const parts = url.pathname.split("/").filter(Boolean);

  // ex: ["app","barraca","<uuid>"]
  const idxBarraca = parts.indexOf("barraca");
  if (idxBarraca >= 0 && parts[idxBarraca + 1]) return parts[idxBarraca + 1];

  // ex: ["app","<uuid>"]
  const idxApp = parts.indexOf("app");
  if (idxApp >= 0 && parts[idxApp + 1]) return parts[idxApp + 1];

  return null;
}

export default function AppHomeClient({ barracaId }: { barracaId: string | null }) {
  const [effectiveBarracaId, setEffectiveBarracaId] = useState<string | null>(barracaId ?? null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);

  // Resolve barracaId automaticamente pela URL (sem hooks do Next)
  useEffect(() => {
    const id = parseBarracaIdFromLocation();
    if (id) setEffectiveBarracaId(id);

    const onPop = () => {
      const next = parseBarracaIdFromLocation();
      setEffectiveBarracaId(next);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Apenas indicadores operacionais (sem $$)
  const pedidosHoje = useMemo(() => {
    const now = new Date();
    return pedidos.filter((p) => {
      const dt = new Date(p.created_at);
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
    }).length;
  }, [pedidos]);

  const emPreparo = useMemo(() => {
    return pedidos.filter((p) => normalizeStatus(p.status) === "preparando").length;
  }, [pedidos]);

  // Agrupar para o mini-kanban
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

    // mais recentes primeiro
    const sortByNew = (a: PedidoRow, b: PedidoRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    return {
      recebido: rec.sort(sortByNew),
      preparando: prep.sort(sortByNew),
      pronto: pronto.sort(sortByNew),
      entregue: ent.sort(sortByNew),
    };
  }, [pedidos]);

  // Carregar pedidos
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErrorMsg(null);

      if (!effectiveBarracaId) {
        setPedidos([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(`/api/app/pedidos?barraca_id=${encodeURIComponent(effectiveBarracaId)}&limit=50`, {
          cache: "no-store",
        });

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
    const t = window.setInterval(load, 5000); // atualização a cada 5s (sensação de “tempo real”)
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [effectiveBarracaId]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold tracking-tight text-[color:var(--text)]">Painel operacional</div>
        <div className="mt-1 text-sm text-[color:var(--text-2)]">Pedidos em tempo real para cozinha/garçom (ambiente TEST).</div>
      </div>

      {/* Indicadores operacionais (sem finanças) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="wavie-card p-4">
          <div className="text-xs text-[color:var(--text-2)]">Pedidos hoje</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
            {effectiveBarracaId ? String(pedidosHoje) : "—"}
          </div>
        </div>

        <div className="wavie-card p-4">
          <div className="text-xs text-[color:var(--text-2)]">Em preparo</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
            {effectiveBarracaId ? String(emPreparo) : "—"}
          </div>
          <div className="mt-1 text-xs text-[color:var(--muted)]">Fila da cozinha agora</div>
        </div>
      </div>

      {/* Ações úteis para TEST (sem billing no operacional) */}
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/b/nelsaodrinks">Abrir cardápio (nelsaodrinks)</ButtonLink>
        <ButtonLink href="/app/barraca/9f56ce53-1ec1-4e03-ae4c-64b2b2085e95">Conectar barraca (exemplo)</ButtonLink>
      </div>

      {!effectiveBarracaId ? (
        <div className="wavie-card p-6">
          <div className="text-sm font-semibold text-[color:var(--text)]">Conectar barraca</div>
          <div className="mt-2 text-sm text-[color:var(--text-2)]">Para carregar pedidos, abra:</div>
          <div className="mt-3 flex flex-wrap gap-3">
            <ButtonLink href="/app/barraca/9f56ce53-1ec1-4e03-ae4c-64b2b2085e95">Abrir barraca (exemplo)</ButtonLink>
            <ButtonLink href="/b/nelsaodrinks">Abrir cardápio (nelsaodrinks)</ButtonLink>
          </div>
          <div className="mt-3 text-xs text-[color:var(--muted)]">Depois o login vai definir automaticamente a barraca do cliente.</div>
        </div>
      ) : loading ? (
        <div className="wavie-card p-6 text-sm text-[color:var(--text-2)]">Carregando pedidos…</div>
      ) : errorMsg ? (
        <div className="wavie-card p-6">
          <div className="text-sm font-semibold text-[color:var(--text)]">Não foi possível carregar pedidos</div>
          <div className="mt-2 text-sm text-[color:var(--text-2)]">{errorMsg}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <KanbanColumn title="Recebido" subtitle="Novos pedidos" pedidos={grouped.recebido} empty="Sem pedidos recebidos no momento." />
          <KanbanColumn title="Preparando" subtitle="Em produção" pedidos={grouped.preparando} empty="Nada em preparo agora." />
          <KanbanColumn title="Pronto" subtitle="Entregar agora" pedidos={grouped.pronto} empty="Nada pronto para entrega." />
          <KanbanColumn title="Entregue" subtitle="Últimos pedidos" pedidos={grouped.entregue} empty="Sem entregues ainda." />
        </div>
      )}

      <div className="wavie-card p-5">
        <div className="text-sm font-semibold text-[color:var(--text)]">Foco: execução</div>
        <div className="mt-1 text-sm text-[color:var(--text-2)]">Itens sempre visíveis, status claro e leitura rápida em celular/tablet.</div>
        <div className="mt-3 text-xs text-[color:var(--muted)]">Atualiza automaticamente a cada 5s para sensação de tempo real.</div>
      </div>
    </div>
  );
}
