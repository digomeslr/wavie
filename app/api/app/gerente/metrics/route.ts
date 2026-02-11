import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type HourBucket = { hour: number; count: number };
type DayBucket = { date: string; count: number; revenue: number };

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normStatus(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

function isDoneStatus(s: string) {
  const x = normStatus(s);
  return x === "pronto" || x === "entregue" || x === "finalizado";
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

function sinceHoursISO(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function sinceDaysISO(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function localDateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const barraca_id = searchParams.get("barraca_id");
    const range = (searchParams.get("range") ?? "today").toLowerCase() as
      | "today"
      | "24h"
      | "7d";

    if (!barraca_id) {
      return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
    }

    const since =
      range === "24h" ? sinceHoursISO(24) : range === "7d" ? sinceDaysISO(7) : startOfTodayISO();

    // pedidos no range (limite alto para BI básico)
    const { data: pedidos, error: pErr } = await supabase
      .from("pedidos")
      .select("id,total,status,created_at,local,barraca_id")
      .eq("barraca_id", barraca_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const rows = (pedidos ?? []) as any[];
    const pedidosCount = rows.length;

    const faturamento = rows.reduce((acc, p) => {
      return acc + (isDoneStatus(p.status) ? Number(p.total ?? 0) : 0);
    }, 0);

    const ticketMedio = pedidosCount > 0 ? faturamento / pedidosCount : null;

    // SLA proxy (NOW - created_at) — útil enquanto não temos timestamps por status
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

    // Pico por hora (para today/24h)
    const buckets = new Array<number>(24).fill(0);
    for (const p of rows) buckets[hourLocalFromISO(p.created_at)] += 1;

    const pedidosPorHora: HourBucket[] = buckets.map((count, hour) => ({ hour, count }));
    const peakHour = pedidosPorHora.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      { hour: 0, count: 0 }
    );

    // 7d: buckets por dia + receita por dia
    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (const p of rows) {
      const k = localDateKey(p.created_at);
      const cur = dayMap.get(k) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      if (isDoneStatus(p.status)) cur.revenue += Number(p.total ?? 0);
      dayMap.set(k, cur);
    }

    // garante 7 dias (inclusive hoje), em ordem crescente
    const days: DayBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const k = localDateKey(d.toISOString());
      const v = dayMap.get(k) ?? { count: 0, revenue: 0 };
      days.push({ date: k, count: v.count, revenue: v.revenue });
    }

    const peakDay = days.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      { date: days[0]?.date ?? localDateKey(new Date().toISOString()), count: 0, revenue: 0 }
    );

    // tempo médio proxy: somente concluídos
    const doneRows = rows.filter((p) => isDoneStatus(p.status));
    let avgPrepMins: number | null = null;
    if (doneRows.length > 0) {
      const sum = doneRows.reduce((acc, p) => {
        const mins = Math.max(0, Math.floor((nowMs - new Date(p.created_at).getTime()) / 60000));
        return acc + mins;
      }, 0);
      avgPrepMins = Math.round(sum / doneRows.length);
    }

    // Top produtos
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
        .slice(0, 8);
    }

    return NextResponse.json(
      {
        data: {
          range,
          since,
          pedidos: pedidosCount,
          faturamento,
          ticketMedio,
          sla,
          slaPct,
          pedidosPorHora,
          peakHour,
          days, // 7d
          peakDay,
          avgPrepMins,
          topProdutos,
          ultimosPedidos: rows.slice(0, 20),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
