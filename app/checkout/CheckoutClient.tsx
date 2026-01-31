// app/checkout/CheckoutClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Produto = {
  id: string;
  nome: string;
  preco: number;
};

const FALLBACK_BARRACA_ID = "9f56ce53-1ec1-4e03-ae4c-64b2b2085e95";
const CART_KEY = "praiapay_cart_v1";

function brl(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function writeCart(cart: Record<string, number>) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {}
}

function readCart(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

// base64 seguro (utf-8)
function fromB64(b64: string) {
  const bin = atob(b64);
  const esc = Array.from(bin)
    .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  const json = decodeURIComponent(esc);
  return JSON.parse(json);
}

export default function CheckoutClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [barracaId, setBarracaId] = useState<string>(FALLBACK_BARRACA_ID);
  const [loadingProdutos, setLoadingProdutos] = useState(true);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [local, setLocal] = useState("");
  const [saving, setSaving] = useState(false);

  // resolve barraca e carrinho via URL (sempre que a URL mudar)
  useEffect(() => {
    const b = sp.get("b");
    const c = sp.get("c") || "";

    if (b) {
      setBarracaId(b);
      try {
        localStorage.setItem("praiapay_barraca_id", b);
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem("praiapay_barraca_id");
        if (saved) setBarracaId(saved);
      } catch {}
    }

    // carrinho: URL tem prioridade
    try {
      if (c) {
        const decoded = fromB64(decodeURIComponent(c));
        if (decoded && typeof decoded === "object") {
          setCart(decoded);
          writeCart(decoded);
          return;
        }
      }
    } catch {
      // fallback
    }

    const stored = readCart();
    setCart(stored);
  }, [sp]);

  // carregar local salvo
  useEffect(() => {
    try {
      setLocal(localStorage.getItem("praiapay_local") || "");
    } catch {}
  }, []);

  // persist local
  useEffect(() => {
    try {
      localStorage.setItem("praiapay_local", local);
      localStorage.setItem("praiapay_barraca_id", barracaId);
    } catch {}
  }, [local, barracaId]);

  // carregar produtos
  useEffect(() => {
    let alive = true;

    async function loadProdutos() {
      setLoadingProdutos(true);
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, preco")
        .eq("barraca_id", barracaId)
        .eq("ativo", true);

      if (!alive) return;
      if (!error && data) setProdutos(data as any);
      setLoadingProdutos(false);
    }

    loadProdutos();
    return () => {
      alive = false;
    };
  }, [barracaId]);

  function inc(id: string) {
    setCart((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      writeCart(next);
      return next;
    });
  }

  function dec(id: string) {
    setCart((prev) => {
      const q = (prev[id] ?? 0) - 1;
      const next = { ...prev };
      if (q <= 0) delete next[id];
      else next[id] = q;
      writeCart(next);
      return next;
    });
  }

  const items = useMemo(() => {
    if (loadingProdutos) return [];
    return Object.entries(cart)
      .map(([pid, q]) => {
        const p = produtos.find((x) => x.id === pid);
        if (!p) return null;
        const unit = Number(p.preco);
        return {
          produto_id: pid,
          nome: p.nome,
          quantidade: q,
          preco_unitario: unit,
          subtotal: unit * q,
        };
      })
      .filter(Boolean) as any[];
  }, [cart, produtos, loadingProdutos]);

  const total = useMemo(() => items.reduce((s, it) => s + it.subtotal, 0), [items]);
  const itemsCount = useMemo(() => items.reduce((s, it) => s + it.quantidade, 0), [items]);

  async function confirmar() {
    if (saving) return;
    if (loadingProdutos) return;
    if (items.length === 0) return;

    setSaving(true);
    try {
      const localTrim = local?.trim() || "";

      const { data: pedido, error: pErr } = await supabase
        .from("pedidos")
        .insert({
          tipo: "qr",
          status: "recebido",
          local: localTrim ? localTrim : null,
          total,
          barraca_id: barracaId,
          pago: false,
        })
        .select("id")
        .single();

      if (pErr) throw pErr;

      const payload = items.map((it) => ({
        pedido_id: pedido.id,
        produto_id: it.produto_id,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
      }));

      const { error: iErr } = await supabase.from("itens_pedido").insert(payload);
      if (iErr) throw iErr;

      // limpar carrinho
      setCart({});
      writeCart({});
      router.push(`/confirmacao/${pedido.id}`);
    } catch {
      alert("Erro ao confirmar pedido. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 md:p-6 pb-28">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Checkout</h1>
            <p className="text-slate-500 mt-1 text-sm">Confirme seu pedido</p>
          </div>

          <Link
            href={`/menu?b=${encodeURIComponent(barracaId)}`}
            className="text-sm font-semibold text-slate-700 hover:underline"
          >
            Voltar ao menu
          </Link>
        </header>

        {/* Local */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Local
          </div>
          <input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Ex: Guarda-sol 18"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <p className="mt-2 text-sm text-slate-500">
            Dica: use “Guarda-sol 18”, “Mesa 3”, “Cadeira azul”, etc.
          </p>
        </section>

        {/* Itens */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Itens</h2>
            <div className="text-sm text-slate-500">
              {loadingProdutos ? "Carregando…" : `${itemsCount} item(ns)`}
            </div>
          </div>

          {!loadingProdutos && items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-slate-600">
              Seu carrinho está vazio.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <article
                  key={it.produto_id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-slate-900 truncate">
                        {it.nome}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {brl(it.preco_unitario)} cada
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {brl(it.subtotal)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-slate-500">{it.quantidade}x</div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => dec(it.produto_id)}
                        className="w-10 h-10 rounded-2xl border border-slate-200 bg-white text-lg font-semibold"
                      >
                        −
                      </button>
                      <div className="w-10 text-center font-semibold text-slate-900">
                        {it.quantidade}
                      </div>
                      <button
                        onClick={() => inc(it.produto_id)}
                        className="w-10 h-10 rounded-2xl border border-slate-200 bg-white text-lg font-semibold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Barra fixa */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200">
        <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">Total</div>
            <div className="text-xl font-bold text-slate-900">{brl(total)}</div>
          </div>

          <button
            onClick={confirmar}
            disabled={saving || loadingProdutos || items.length === 0}
            className={`shrink-0 px-5 py-3 rounded-2xl text-white font-semibold ${
              saving || loadingProdutos || items.length === 0
                ? "bg-slate-300"
                : "bg-slate-900 hover:opacity-95 active:opacity-90"
            }`}
          >
            {saving ? "Confirmando..." : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </main>
  );
}
