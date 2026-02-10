import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type BodyItem = {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
};

function isOperationalBlock(errMsg: string) {
  return (
    errMsg.includes("client_restricted_checkout_blocked") ||
    errMsg.includes("client_blocked")
  );
}

/**
 * GET /api/app/pedidos?barraca_id=<uuid>&limit=50
 * Painel operacional — pedidos + itens com nome real do produto
 */
export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const barraca_id = searchParams.get("barraca_id");
    const limitRaw = searchParams.get("limit");
    const limit = Math.max(1, Math.min(Number(limitRaw ?? 50) || 50, 200));

    if (!barraca_id) {
      return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
    }

    // 1) pedidos
    const { data: pedidos, error: pedidosErr } = await supabase
      .from("pedidos")
      .select("id,status,local,created_at,barraca_id")
      .eq("barraca_id", barraca_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (pedidosErr) {
      return NextResponse.json({ error: pedidosErr.message }, { status: 500 });
    }

    if (!pedidos || pedidos.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const pedidoIds = pedidos.map((p) => p.id);

    // 2) itens + nome do produto (JOIN correto)
    const { data: itens, error: itensErr } = await supabase
      .from("itens_pedido")
      .select(
        `
        pedido_id,
        quantidade,
        produtos (
          nome
        )
      `
      )
      .in("pedido_id", pedidoIds);

    if (itensErr) {
      return NextResponse.json({ error: itensErr.message }, { status: 500 });
    }

    // 3) agrupar itens por pedido
    const byPedido: Record<string, { name: string; quantity: number }[]> = {};

    for (const it of itens ?? []) {
      const item = {
        name: it.produtos?.nome ?? "Produto",
        quantity: it.quantidade ?? 1,
      };

      if (!byPedido[it.pedido_id]) byPedido[it.pedido_id] = [];
      byPedido[it.pedido_id].push(item);
    }

    // 4) payload final
    const enriched = pedidos.map((p) => ({
      ...p,
      items: byPedido[p.id] ?? [],
    }));

    return NextResponse.json({ data: enriched }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

/* POST permanece exatamente como já está no seu código */
export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const body = (await req.json()) as {
      barraca_id: string;
      local: string;
      items: BodyItem[];
    };

    if (!body?.barraca_id) {
      return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
    }

    if (!body?.local || body.local.trim().length < 2) {
      return NextResponse.json({ error: "local obrigatório" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "items obrigatório" }, { status: 400 });
    }

    const { data: barraca, error: barracaErr } = await supabase
      .from("barracas")
      .select("id, client_id")
      .eq("id", body.barraca_id)
      .single();

    if (barracaErr || !barraca?.client_id) {
      return NextResponse.json({ error: "barraca inválida" }, { status: 500 });
    }

    const total = body.items.reduce(
      (sum, it) => sum + Number(it.preco_unitario || 0) * Number(it.quantidade || 0),
      0
    );

    const { data: pedido, error: pedidoErr } = await supabase
      .from("pedidos")
      .insert({
        tipo: "qr",
        status: "recebido",
        local: body.local.trim(),
        total,
        forma_pagamento: "pendente",
        pago: false,
        barraca_id: body.barraca_id,
      })
      .select("id")
      .single();

    if (pedidoErr) {
      return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    }

    const itensToInsert = body.items.map((it) => ({
      pedido_id: pedido.id,
      produto_id: it.produto_id,
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
    }));

    const { error: itensErr } = await supabase.from("itens_pedido").insert(itensToInsert);

    if (itensErr) {
      await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      return NextResponse.json({ error: itensErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: pedido.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
