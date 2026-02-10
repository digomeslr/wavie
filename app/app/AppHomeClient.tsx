"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PedidoItem = {
  name: string;
  quantity: number;
};

type PedidoRow = {
  id: string;
  status: "recebido" | "preparando" | "pronto" | "entregue" | string;
  local: string | null;
  created_at: string;
  barraca_id: string;
  items?: PedidoItem[];
};

/* 🔑 RESOLVE BARRACA PELO PATH */
function resolveBarracaId(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("app");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

function normalizeStatus(s: string | null | undefined) {
  const x = (s ?? "").toLowerCase();
  if (x === "preparando") return "preparando";
  if (x === "pronto") return "pronto";
  if (x === "entregue") return "entregue";
  return "recebido";
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
      {children}
    </span>
  );
}

function OrderItems({ items }: { items?: PedidoItem[] }) {
  if (!items || items.length === 0) {
    return <div className="mt-2 text-xs text-white/40">Itens: —</div>;
  }

  return (
    <div className="mt-2 space-y-1 text-xs">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-white/50">{item.quantity}x</span>
          <span className="text-white">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ p }: { p: PedidoRow }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2">
        <div className="font-semibold text-white">
          Pedido #{p.id.slice(0, 6).toUpperCase()}
        </div>
        <Pill>{normalizeStatus(p.status)}</Pill>
      </div>

      <div className="mt-1 text-xs text-white/50">
        Local: {p.local ?? "—"} • {new Date(p.created_at).toLocaleString("pt-BR")}
      </div>

      <OrderItems items={p.items} />
    </div>
  );
}

export default function AppHomeClient() {
  const [barracaId, setBarracaId] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const lastHash = useRef("");

  /* 🔑 resolve barraca ao carregar */
  useEffect(() => {
    setBarracaId(resolveBarracaId());
  }, []);

  /* 🔁 load pedidos */
  useEffect(() => {
    if (!barracaId) return;

    async function load() {
      const res = await fetch(`/api/app/pedidos?barraca_id=${barracaId}`, {
        cache: "no-store",
      });
      const json = await res.json();

      const next = json.data as PedidoRow[];
      const hash = JSON.stringify(next);

      if (hash !== lastHash.current) {
        lastHash.current = hash;
        setPedidos(next);
      }
    }

    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [barracaId]);

  const grouped = useMemo(() => {
    return {
      recebido: pedidos.filter((p) => normalizeStatus(p.status) === "recebido"),
      preparando: pedidos.filter((p) => normalizeStatus(p.status) === "preparando"),
      pronto: pedidos.filter((p) => normalizeStatus(p.status) === "pronto"),
      entregue: pedidos.filter((p) => normalizeStatus(p.status) === "entregue"),
    };
  }, [pedidos]);

  if (!barracaId) {
    return (
      <div className="p-6 text-sm text-white/60">
        Nenhuma barraca conectada pela URL.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      {(["recebido", "preparando", "pronto", "entregue"] as const).map((k) => (
        <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-white capitalize">{k}</div>
            <Pill>{grouped[k].length}</Pill>
          </div>

          <div className="space-y-3">
            {grouped[k].map((p) => (
              <OrderCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
