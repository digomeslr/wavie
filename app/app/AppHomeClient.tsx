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

function normalizeStatus(s: string | null | undefined) {
  const x = (s ?? "").toLowerCase().trim();
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

/* 🔥 RENDERIZAÇÃO CORRETA DOS ITENS */
function OrderItems({ items }: { items?: PedidoItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="mt-2 text-xs text-white/40">
        Itens: —
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1 text-xs">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-2 text-white/80">
          <span className="text-white/50">{item.quantity}x</span>
          <span className="font-medium text-white">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ pedido }: { pedido: PedidoRow }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2">
        <div className="font-semibold text-white">
          Pedido #{pedido.id.slice(0, 6).toUpperCase()}
        </div>
        <Pill>{normalizeStatus(pedido.status)}</Pill>
      </div>

      <div className="mt-2 text-xs text-white/50">
        Local: {pedido.local ?? "—"}
      </div>

      <OrderItems items={pedido.items} />
    </div>
  );
}

export default function AppHomeClient({ barracaId }: { barracaId: string | null }) {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const lastHash = useRef("");

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

  function Column({ title, items }: { title: string; items: PedidoRow[] }) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-white">{title}</div>
          <Pill>{items.length}</Pill>
        </div>

        <div className="space-y-3">
          {items.map((p) => (
            <OrderCard key={p.id} pedido={p} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Column title="Recebido" items={grouped.recebido} />
      <Column title="Preparando" items={grouped.preparando} />
      <Column title="Pronto" items={grouped.pronto} />
      <Column title="Entregue" items={grouped.entregue} />
    </div>
  );
}
