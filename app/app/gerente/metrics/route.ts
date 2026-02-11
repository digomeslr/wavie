import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SLAStats = {
  green: number; // <10m
  yellow: number; // 10-19m
  red: number; // >=20m
};

function startOfDayISO() {
  // Dia local do servidor (ok para dashboard do dia em TEST; depois refinamos com TZ)
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const barraca_id = searchParams.get("barraca_id");
    if (!barraca_id) {
      return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
    }

    const since = startOfDayISO();

    // 1) pedidos do dia
    const { data: pedidos, error: pErr } = await supabase
      .from("pedidos")
      .select("id,total,status,created_at,local,barraca_id")
      .eq("barraca_id", barraca_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const rows = pedidos ?? [];
    const pedidosHoje = rows.length;
    const faturamentoHoje = rows.reduce((acc, p: any) => acc + Number(p.total ?? 0), 0);
    const ticketMedio = pedidosHoje > 0 ? faturamentoHoje / pedidosHoje : null;

    // 2) SLA (pelos minutos desde created_at, usando thresholds 10/20)
    const sla: SLAStats = { green: 0, yellow: 0, red: 0 };
    const now = Date.now();
    for (const p of rows as any[]) {
      const mins = Math.max(0, Math.floor((now - new Date(p.created_at).getTime()) / 60000));
      if (mins < 10) sla.green += 1;
      else if (mins < 20) sla.yellow += 1;
      else sla.red += 1;
    }

    // 3) Top produtos do dia (itens_pedido + produtos)
    const pedidoIds = rows.map((p: any) => p.id);
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
          pedidosHoje,
          faturamentoHoje,
          ticketMedio,
          sla,
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
