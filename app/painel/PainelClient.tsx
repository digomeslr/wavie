// app/painel/PainelClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Produto = { id: string; nome: string; preco: number };

type Pedido = {
  id: string;
  status: string;
  local: string | null;
  total: number;
  created_at: string;
  tipo?: string | null;
  forma_pagamento?: "dinheiro" | "pix" | "cartao" | null;
  pago?: boolean | null;
  itens_pedido: {
    quantidade: number;
    preco_unitario: number;
    produtos: { nome: string } | null;
  }[];
};

const SOUND_KEY = "praiapay_panel_sound_v1";
const LAST_B_KEY = "praiapay_barraca_id";

function brl(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function shortId(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}
function statusKey(status: string) {
  return (status || "").toLowerCase().trim();
}
function statusLabel(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "RECEBIDO";
  if (s === "preparando") return "PREPARANDO";
  if (s === "pronto") return "PRONTO";
  if (s === "entregue") return "ENTREGUE";
  if (s === "cancelado") return "CANCELADO";
  return (status || "—").toUpperCase();
}
function pillClass(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "bg-slate-900 text-white border-slate-900";
  if (s === "preparando") return "bg-amber-500 text-white border-amber-500";
  if (s === "pronto") return "bg-sky-600 text-white border-sky-600";
  if (s === "entregue") return "bg-emerald-600 text-white border-emerald-600";
  if (s === "cancelado") return "bg-rose-600 text-white border-rose-600";
  return "bg-slate-800 text-white border-slate-800";
}
function accentBar(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "bg-slate-900";
  if (s === "preparando") return "bg-amber-500";
  if (s === "pronto") return "bg-sky-600";
  if (s === "entregue") return "bg-emerald-600";
  if (s === "cancelado") return "bg-rose-600";
  return "bg-slate-300";
}
function localTextClass(status: string) {
  const s = statusKey(status);
  if (s === "preparando") return "text-amber-900";
  if (s === "pronto") return "text-sky-900";
  if (s === "entregue") return "text-emerald-900";
  if (s === "cancelado") return "text-rose-900";
  return "text-slate-900";
}
function minutesSince(iso: string) {
  const t = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}
function minutesAgoLabel(min: number) {
  if (min <= 0) return "agora";
  if (min === 1) return "há 1 min";
  return `há ${min} min`;
}
function nextStatus(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "preparando";
  if (s === "preparando") return "pronto";
  if (s === "pronto") return "entregue";
  return null;
}
function nextActionLabel(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "Iniciar preparo";
  if (s === "preparando") return "Marcar pronto";
  if (s === "pronto") return "Marcar entregue";
  return "";
}
function actionButtonClass(status: string) {
  const s = statusKey(status);
  if (s === "recebido") return "bg-slate-900";
  if (s === "preparando") return "bg-sky-700";
  if (s === "pronto") return "bg-emerald-700";
  return "bg-slate-300";
}

/** SLA: "ok" | "warn" | "urgent" */
function slaLevel(p: Pedido) {
  const s = statusKey(p.status);
  const m = minutesSince(p.created_at);

  if (s === "recebido") {
    if (m >= 10) return "urgent";
    if (m >= 5) return "warn";
  }
  if (s === "preparando") {
    if (m >= 15) return "urgent";
    if (m >= 10) return "warn";
  }
  return "ok";
}

function slaBadge(level: "ok" | "warn" | "urgent", min: number) {
  if (level === "urgent") {
    return (
      <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-xs font-extrabold tracking-wider shadow-sm">
        URGENTE • {min}m
      </span>
    );
  }
  if (level === "warn") {
    return (
      <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-extrabold tracking-wider shadow-sm">
        ATENÇÃO • {min}m
      </span>
    );
  }
  return null;
}

/** Beep simples com WebAudio */
function playBeep() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close?.();
    }, 120);
  } catch {}
}

export default function PainelClient() {
  const sp = useSearchParams();
  const bFromUrl = sp.get("b");

  const [barracaId, setBarracaId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  // modal balcão
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [local, setLocal] = useState("");
  const [forma, setForma] = useState<"dinheiro" | "pix" | "cartao">("dinheiro");
  const [saving, setSaving] = useState(false);

  // som ligado/desligado
  const [soundOn, setSoundOn] = useState(true);

  // novos pedidos (highlight + som)
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  // resolve barracaId: URL -> storage -> fallback piloto
  useEffect(() => {
    const fallback = "9f56ce53-1ec1-4e03-ae4c-64b2b2085e95";
    let fromStorage: string | null = null;
    try {
      fromStorage = localStorage.getItem(LAST_B_KEY);
    } catch {}

    const chosen = (bFromUrl && bFromUrl.trim()) || fromStorage || fallback;
    setBarracaId(chosen);

    try {
      localStorage.setItem(LAST_B_KEY, chosen);
    } catch {}
  }, [bFromUrl]);

  // carregar preferência de som
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOUND_KEY);
      if (raw === "0") setSoundOn(false);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
    } catch {}
  }, [soundOn]);

  async function load() {
    if (!barracaId) return;
    setLoading(true);

    const [{ data: pedidosData, error: pErr }, { data: prodsData, error: prErr }] =
      await Promise.all([
        supabase
          .from("pedidos")
          .select(
            `
            id,
            status,
            local,
            total,
            created_at,
            tipo,
            forma_pagamento,
            pago,
            itens_pedido (
              quantidade,
              preco_unitario,
              produtos ( nome )
            )
          `
          )
          .eq("barraca_id", barracaId)
          .order("created_at", { ascending: true }),
        supabase
          .from("produtos")
          .select("id, nome, preco")
          .eq("barraca_id", barracaId)
          .eq("ativo", true)
          .order("nome", { ascending: true }),
      ]);

    if (!prErr && prodsData) setProdutos(prodsData as any);

    if (!pErr && pedidosData) {
      const list = pedidosData as any as Pedido[];
      setPedidos(list);

      // detectar "novos em recebido"
      const newlyReceived: string[] = [];
      for (const p of list) {
        const s = statusKey(p.status);
        if (s === "recebido" && !seenIdsRef.current.has(p.id)) newlyReceived.push(p.id);
      }

      if (newlyReceived.length > 0) {
        newlyReceived.forEach((id) => seenIdsRef.current.add(id));

        setFreshIds((prev) => {
          const next = new Set(prev);
          newlyReceived.forEach((id) => next.add(id));
          return next;
        });

        if (soundOn) playBeep();

        setTimeout(() => {
          setFreshIds((prev) => {
            const next = new Set(prev);
            newlyReceived.forEach((id) => next.delete(id));
            return next;
          });
        }, 12000);
      } else {
        for (const p of list) seenIdsRef.current.add(p.id);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!barracaId) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barracaId]);

  // ordenar: urgentes no topo, depois FIFO
  function orderSmart(list: Pedido[]) {
    return [...list].sort((a, b) => {
      const la = slaLevel(a);
      const lb = slaLevel(b);
      const pa = la === "urgent" ? 2 : la === "warn" ? 1 : 0;
      const pb = lb === "urgent" ? 2 : lb === "warn" ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  const recebido = useMemo(
    () => orderSmart(pedidos.filter((p) => statusKey(p.status) === "recebido")),
    [pedidos]
  );
  const preparando = useMemo(
    () => orderSmart(pedidos.filter((p) => statusKey(p.status) === "preparando")),
    [pedidos]
  );
  const pronto = useMemo(
    () => orderSmart(pedidos.filter((p) => statusKey(p.status) === "pronto")),
    [pedidos]
  );
  const entregue = useMemo(
    () =>
      pedidos
        .filter((p) => statusKey(p.status) === "entregue")
        .slice(-20)
        .reverse(),
    [pedidos]
  );

  async function setStatus(pedidoId: string, status: string) {
    await supabase.from("pedidos").update({ status }).eq("id", pedidoId);
    load();
  }

  async function advance(p: Pedido) {
    const nx = nextStatus(p.status);
    if (!nx) return;

    if (nx === "entregue") {
      const ok = window.confirm("Confirmar que este pedido foi ENTREGUE?");
      if (!ok) return;
    }

    await setStatus(p.id, nx);
  }

  // --- balcão cart ---
  function inc(prodId: string) {
    setCart((c) => ({ ...c, [prodId]: (c[prodId] ?? 0) + 1 }));
  }
  function dec(prodId: string) {
    setCart((c) => {
      const q = (c[prodId] ?? 0) - 1;
      if (q <= 0) {
        const cp = { ...c };
        delete cp[prodId];
        return cp;
      }
      return { ...c, [prodId]: q };
    });
  }

  const totalBalcao = useMemo(() => {
    return Object.entries(cart).reduce((sum, [id, q]) => {
      const p = produtos.find((x) => x.id === id);
      return sum + (p ? Number(p.preco) * q : 0);
    }, 0);
  }, [cart, produtos]);

  async function criarPedidoBalcao() {
    if (saving) return;
    setSaving(true);

    try {
      const items = Object.entries(cart)
        .map(([id, q]) => {
          const p = produtos.find((x) => x.id === id);
          if (!p) return null;
          return { produto_id: id, quantidade: q, preco_unitario: Number(p.preco) };
        })
        .filter(Boolean) as { produto_id: string; quantidade: number; preco_unitario: number }[];

      if (items.length === 0) {
        alert("Adicione itens ao pedido.");
        return;
      }

      const total = items.reduce((s, it) => s + it.preco_unitario * it.quantidade, 0);

      const { data: pedido, error } = await supabase
        .from("pedidos")
        .insert({
          tipo: "balcao",
          status: "recebido",
          local: local?.trim() ? local.trim() : null,
          total,
          forma_pagamento: forma,
          pago: true,
          barraca_id: barracaId,
        })
        .select("id")
        .single();

      if (error) throw error;

      const payload = items.map((it) => ({ ...it, pedido_id: pedido.id }));
      const { error: itensErr } = await supabase.from("itens_pedido").insert(payload);
      if (itensErr) throw itensErr;

      setOpen(false);
      setCart({});
      setLocal("");
      setForma("dinheiro");

      load();
    } catch {
      alert("Erro ao criar pedido balcão.");
    } finally {
      setSaving(false);
    }
  }

  function Column({
    title,
    hint,
    highlight,
    items,
  }: {
    title: string;
    hint?: string;
    highlight?: boolean;
    items: Pedido[];
  }) {
    return (
      <section
        className={`rounded-3xl border shadow-sm ${
          highlight ? "bg-sky-50 border-sky-200" : "bg-white border-slate-100"
        }`}
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {hint ? <div className="text-xs text-slate-500 mt-0.5">{hint}</div> : null}
          </div>
          <div className="text-xs font-semibold text-slate-500">{items.length}</div>
        </div>

        <div className="p-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-sm text-slate-500 px-2 py-6 text-center">Nada aqui.</div>
          ) : (
            items.map((p) => <OrderCard key={p.id} p={p} />)
          )}
        </div>
      </section>
    );
  }

  function OrderCard({ p }: { p: Pedido }) {
    const s = statusKey(p.status);
    const action = nextStatus(p.status);
    const isFresh = freshIds.has(p.id);
    const isPronto = s === "pronto";

    const min = minutesSince(p.created_at);
    const level = slaLevel(p);

    return (
      <article
        className={`relative bg-white rounded-2xl border shadow-sm p-3 overflow-hidden ${
          isFresh ? "ring-2 ring-slate-900/10 animate-pulse" : "border-slate-200/60"
        } ${
          level === "urgent"
            ? "ring-2 ring-rose-500/40"
            : level === "warn"
            ? "ring-2 ring-amber-400/30"
            : ""
        }`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-2 ${accentBar(p.status)}`} />

        {isPronto ? (
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-sky-600 text-white text-xs font-extrabold tracking-wider shadow-sm">
            PRONTO
          </div>
        ) : null}

        <div className="absolute top-3 left-4">{slaBadge(level as any, min)}</div>

        <div className="pl-3 pt-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Local
            </div>
            <div
              className={`mt-0.5 text-lg font-extrabold tracking-tight truncate ${localTextClass(
                p.status
              )}`}
            >
              {p.local ? p.local : "Sem local"}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold border ${pillClass(
                  p.status
                )}`}
              >
                {statusLabel(p.status)}
              </span>
              <span className="text-xs text-slate-500">{minutesAgoLabel(min)}</span>
              <span className="text-xs text-slate-400">#{shortId(p.id)}</span>
              {p.tipo ? (
                <span className="text-xs text-slate-400">
                  • {p.tipo === "balcao" ? "Balcão" : "QR"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Total
            </div>
            <div className="mt-0.5 text-base font-extrabold text-slate-900">
              {brl(p.total || 0)}
            </div>
          </div>
        </div>

        <div className="pl-3 mt-3 border-t border-slate-100 pt-3">
          <div className="space-y-1.5">
            {(p.itens_pedido || []).map((it, idx) => {
              const nome = it.produtos?.nome || "Item";
              const qtd = Number(it.quantidade || 0);
              const unit = Number(it.preco_unitario || 0);
              const sub = qtd * unit;

              return (
                <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 truncate text-slate-800">{nome}</div>
                  <div className="shrink-0 flex items-center gap-2 font-semibold text-slate-900">
                    <span className="text-slate-600">{qtd}x</span>
                    <span className="text-slate-500">{brl(unit)}</span>
                    <span className="text-slate-900">{brl(sub)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pl-3 mt-3 flex gap-2">
          {action ? (
            <button
              onClick={() => advance(p)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold text-white ${actionButtonClass(
                p.status
              )} hover:opacity-95 active:opacity-90`}
            >
              {nextActionLabel(p.status)}
            </button>
          ) : (
            <div className="flex-1 py-2.5 rounded-2xl text-sm font-semibold bg-slate-100 text-slate-600 text-center">
              Finalizado
            </div>
          )}

          {s !== "entregue" && s !== "cancelado" ? (
            <button
              onClick={() => {
                const ok = window.confirm("Cancelar este pedido?");
                if (!ok) return;
                setStatus(p.id, "cancelado");
              }}
              className="px-3 py-2.5 rounded-2xl text-sm font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:opacity-95 active:opacity-90"
              title="Cancelar pedido"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="px-4 md:px-6 py-6">
        <header className="max-w-6xl mx-auto mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Painel</h1>
            <p className="text-slate-500 mt-1 text-sm">Operação em tempo real • atualiza a cada 5s</p>
            <div className="text-xs text-slate-400 mt-1">
              Barraca: <span className="font-semibold">{barracaId ? shortId(barracaId) : "—"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundOn((v) => !v)}
              className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${
                soundOn
                  ? "bg-white border-slate-200 text-slate-800"
                  : "bg-slate-900 border-slate-900 text-white"
              }`}
              title="Ativar/desativar som de pedido novo"
            >
              Som: {soundOn ? "Ligado" : "Desligado"}
            </button>

            <button
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold hover:opacity-95 active:opacity-90"
            >
              Novo pedido (balcão)
            </button>
          </div>
        </header>

        {loading && pedidos.length === 0 ? (
          <div className="max-w-6xl mx-auto text-slate-500">Carregando…</div>
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Column title="Recebido" hint="Novos pedidos" items={recebido} />
            <Column title="Preparando" hint="Em produção" items={preparando} />
            <Column title="Pronto" hint="Entregar agora" highlight items={pronto} />
            <Column title="Entregue" hint="Últimos 20" items={entregue} />
          </div>
        )}
      </div>

      {/* Modal Balcão */}
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-3xl p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-xl font-semibold">Pedido balcão</h2>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-2xl border border-slate-200 text-slate-700 font-semibold"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
              {produtos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-slate-100"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.nome}</div>
                    <div className="text-sm text-slate-500">{brl(Number(p.preco))}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => dec(p.id)}
                      className="w-10 h-10 rounded-2xl border border-slate-200 text-lg font-semibold"
                    >
                      −
                    </button>
                    <div className="w-8 text-center font-semibold">{cart[p.id] ?? 0}</div>
                    <button
                      onClick={() => inc(p.id)}
                      className="w-10 h-10 rounded-2xl border border-slate-200 text-lg font-semibold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Local (opcional)
              </div>
              <input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: Guarda-sol 18"
                className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 text-lg font-semibold outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Forma de pagamento
              </div>
              <div className="mt-2 flex gap-2">
                {(["dinheiro", "pix", "cartao"] as const).map((f) => {
                  const active = forma === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setForma(f)}
                      className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${
                        active
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-800 border-slate-200"
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Total</div>
                <div className="text-xl font-bold text-slate-900">{brl(totalBalcao)}</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCart({});
                    setLocal("");
                    setForma("dinheiro");
                    setOpen(false);
                  }}
                  className="px-4 py-3 rounded-2xl border border-slate-200 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={criarPedidoBalcao}
                  disabled={saving}
                  className={`px-4 py-3 rounded-2xl font-semibold text-white ${
                    saving ? "bg-slate-300" : "bg-emerald-600 hover:opacity-95 active:opacity-90"
                  }`}
                >
                  {saving ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
