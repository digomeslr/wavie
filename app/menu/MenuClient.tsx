// app/menu/MenuClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Categoria = {
  id: string;
  nome: string;
  ordem: number | null;
};

type Produto = {
  id: string;
  nome: string;
  preco: number;
  categoria_id: string | null;
  ativo: boolean | null;
};

const FALLBACK_BARRACA_ID = "9f56ce53-1ec1-4e03-ae4c-64b2b2085e95";
const CART_KEY = "praiapay_cart_v1";

function brl(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function writeCart(cart: Record<string, number>) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {}
}

function toB64(obj: any) {
  const json = JSON.stringify(obj);
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(utf8);
}

export default function MenuClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const barracaId = sp.get("b") || FALLBACK_BARRACA_ID;

  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");

  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    setCart(readCart());
  }, []);

  useEffect(() => {
    writeCart(cart);
    try {
      localStorage.setItem("praiapay_barraca_id", barracaId);
    } catch {}
  }, [cart, barracaId]);

  async function load() {
    setLoading(true);

    const [{ data: cats, error: cErr }, { data: prods, error: pErr }] =
      await Promise.all([
        supabase
          .from("categorias")
          .select("id, nome, ordem")
          .eq("barraca_id", barracaId)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
        supabase
          .from("produtos")
          .select("id, nome, preco, categoria_id, ativo")
          .eq("barraca_id", barracaId)
          .eq("ativo", true)
          .order("nome", { ascending: true }),
      ]);

    if (!cErr && cats) {
      const list = cats as Categoria[];
      setCategorias(list);
      if (!activeCat && list.length > 0) setActiveCat(list[0].id);
    }

    if (!pErr && prods) setProdutos(prods as Produto[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const produtosDaCategoria = useMemo(() => {
    const list = produtos.filter((p) =>
      activeCat ? p.categoria_id === activeCat : true
    );
    return list.length ? list : produtos;
  }, [produtos, activeCat]);

  const total = useMemo(() => {
    return Object.entries(cart).reduce((sum, [id, q]) => {
      const p = produtos.find((x) => x.id === id);
      return sum + (p ? Number(p.preco) * q : 0);
    }, 0);
  }, [cart, produtos]);

  const itemsCount = useMemo(
    () => Object.values(cart).reduce((s, q) => s + q, 0),
    [cart]
  );

  function goCheckout() {
    writeCart(cart);
    const c = encodeURIComponent(toB64(cart));
    router.push(`/checkout?b=${encodeURIComponent(barracaId)}&c=${c}`);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 md:p-6 pb-28">
        <header className="mb-5">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Cardápio
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Escolha seus itens e finalize em segundos
          </p>
        </header>

        {!loading && categorias.length > 0 && (
          <div className="mb-5 -mx-1 overflow-x-auto">
            <div className="flex gap-2 px-1">
              {categorias.map((c) => {
                const active = c.id === activeCat;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`shrink-0 px-4 py-2 rounded-2xl border text-sm font-semibold ${
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-800 border-slate-200"
                    }`}
                  >
                    {c.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-slate-500">Carregando cardápio…</div>
        ) : produtos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-600 shadow-sm">
            Nenhum produto ativo.
          </div>
        ) : (
          <div className="space-y-4">
            {produtosDaCategoria.map((p) => {
              const q = cart[p.id] ?? 0;
              return (
                <article
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-slate-900 truncate">
                        {p.nome}
                      </div>
                      <div className="text-slate-500 mt-1">
                        {brl(Number(p.preco))}
                      </div>
                    </div>

                    {q === 0 ? (
                      <button
                        onClick={() => inc(p.id)}
                        className="shrink-0 px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold"
                      >
                        Adicionar
                      </button>
                    ) : (
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => dec(p.id)}
                          className="w-10 h-10 rounded-2xl border border-slate-200 text-lg font-semibold"
                        >
                          −
                        </button>
                        <div className="w-10 text-center font-semibold text-slate-900">
                          {q}
                        </div>
                        <button
                          onClick={() => inc(p.id)}
                          className="w-10 h-10 rounded-2xl border border-slate-200 text-lg font-semibold"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra fixa do carrinho */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200">
        <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">Carrinho</div>
            <div className="font-semibold text-slate-900">
              {itemsCount} item(ns) • {brl(total)}
            </div>
          </div>

          <button
            onClick={goCheckout}
            disabled={itemsCount === 0}
            className={`shrink-0 px-5 py-3 rounded-2xl text-white font-semibold ${
              itemsCount > 0 ? "bg-slate-900" : "bg-slate-300"
            }`}
          >
            Ver carrinho
          </button>
        </div>
      </div>
    </main>
  );
}
