import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type HourBucket = { hour: number; count: number };

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hourLocalFromISO(iso: string) {
  const dt = new Date(iso);
  return clampInt(dt.getHours(), 0, 23);
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function since24hISO() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function normStatus(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const barraca_id = searchParams.get("barraca_id");
    const range = (searchParams.get("range") ?? "today").toLowerCase(); // "today" | "24h"

    if (!barraca_id) {
      return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
    }

    const since = range === "24h" ? since24hISO() : startOfTodayISO();

    // 1) pedidos no range
    const { data: pedidos, error: pErr } = await supabase
      .from("pedidos")
      .select("id,total,status,created_at,local,barraca_id")
      .eq("barraca_id", barraca_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const rows = (pedidos ?? []) as any[];
    const pedidosHoje = rows.length;

    // faturamento: somente concluídos (pronto/entregue/finalizado) — em TEST é suficiente
    const faturamentoHoje = rows.reduce((acc, p) => {
      const s = normStatus(p.status);
      const done = s === "pronto" || s === "entregue" || s === "finalizado";
      return acc + (done ? Number(p.total ?? 0) : 0);
    }, 0);

    const ticketMedio = pedidosHoje > 0 ? faturamentoHoje / pedidosHoje : null;

    // 2) SLA (10/20min) baseado em NOW - created_at (válido sem *_at)
    const sla = { green: 0, yellow: 0, red: 0 };
    const nowMs = Date.now();

    for (const p of rows) {
      const mins = Math.max(0, Math.floor((nowMs - new Date(p.created_at).getTime()) / 60000));
      if (mins < 10) sla.green += 1;
      else if (mins < 20) sla.yellow += 1;
      else sla.red += 1;
    }

    const totalSla = sla.green + sla.yellow + sla.red;
    const slaPct =
      totalSla === 0
        ? null
        : {
            green: Math.round((sla.green / totalSla) * 100),
            yellow: Math.round((sla.yellow / totalSla) * 100),
            red: Math.round((sla.red / totalSla) * 100),
          };

    // 3) Pico por hora
    const buckets = new Array<number>(24).fill(0);
    for (const p of rows) {
      buckets[hourLocalFromISO(p.created_at)] += 1;
    }
    const pedidosPorHora: HourBucket[] = buckets.map((count, hour) => ({ hour, count }));
    const peak = pedidosPorHora.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      { hour: 0, count: 0 }
    );

    // 4) Tempo médio (proxy): média de NOW-created_at apenas dos concluídos
    const doneRows = rows.filter((p) => {
      const s = normStatus(p.status);
      return s === "pronto" || s === "entregue" || s === "finalizado";
    });

    let avgPrepMins: number | null = null;
    if (doneRows.length > 0) {
      const sum = doneRows.reduce((acc, p) => {
        const mins = Math.max(0, Math.floor((nowMs - new Date(p.created_at).getTime()) / 60000));
        return acc + mins;
      }, 0);
      avgPrepMins = Math.round(sum / doneRows.length);
    }

    // 5) Top produtos no range
    const pedidoIds = rows.map((p) => p.id);
    let topProdutos: Array<{ name: string; qty: number }> = [];

    if (pedidoIds.length) {
      const { data: itens, error: iErr } = await supabase
        .from("itens_pedido")
        .select("quantidade, produtos:produtos(nome)")
        .in("pedido_id", pedidoIds);

      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

      const agg = new Map<string, number>();
      for (const it of (itens ?? []) as any[]) {
        const name = (it?.produtos?.nome ?? "Produto").toString();
        const qty = Number(it?.quantidade ?? 0);
        agg.set(name, (agg.get(name) ?? 0) + (Number.isFinite(qty) ? qty : 0));
      }

      topProdutos = Array.from(agg.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
    }

    return NextResponse.json(
      {
        data: {
          range,
          since,
          pedidosHoje,
          faturamentoHoje,
          ticketMedio,
          sla,
          slaPct,
          pedidosPorHora,
          peak,
          avgPrepMins,
          topProdutos,
          ultimosPedidos: rows.slice(0, 12),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
