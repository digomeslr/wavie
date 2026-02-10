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
 * Retorna pedidos + items (sem depender de join com produtos).
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

    const { data: pedidos, error: pedidosErr } = await supabase
      .from("pedidos")
      .select("id,status,local,total,created_at,barraca_id")
      .eq("barraca_id", barraca_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (pedidosErr) {
      return NextResponse.json({ error: pedidosErr.message }, { status: 500 });
    }

    const rows = (pedidos ?? []) as Array<{
      id: string;
      status: string;
      local: string | null;
      total: number | null;
      created_at: string;
      barraca_id: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const pedidoIds = rows.map((p) => p.id);

    // Itens em lote (sem join)
    const { data: itens, error: itensErr } = await supabase
      .from("itens_pedido")
      .select("pedido_id, produto_id, quantidade, preco_unitario")
      .in("pedido_id", pedidoIds);

    if (itensErr) {
      return NextResponse.json({ error: itensErr.message }, { status: 500 });
    }

    const itensRows = (itens ?? []) as Array<{
      pedido_id: string;
      produto_id: string;
      quantidade: number | null;
      preco_unitario: number | null;
    }>;

    const byPedido: Record<
      string,
      Array<{
        produto_id: string;
        name: string | null; // por enquanto pode vir null (UI faz fallback)
        quantity: number | null;
        unit_price: number | null;
        total: number | null;
      }>
    > = {};

    for (const it of itensRows) {
      const qty = it.quantidade ?? 1;
      const unit = it.preco_unitario ?? null;

      const item = {
        produto_id: it.produto_id,
        name: null,
        quantity: qty,
        unit_price: unit,
        total: unit != null ? Number(unit) * Number(qty) : null,
      };

      if (!byPedido[it.pedido_id]) byPedido[it.pedido_id] = [];
      byPedido[it.pedido_id].push(item);
    }

    const enriched = rows.map((p) => ({
      ...p,
      items: byPedido[p.id] ?? [],
    }));

    return NextResponse.json({ data: enriched }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

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

    // 0) Resolve client_id pela barraca
    const { data: barraca, error: barracaErr } = await supabase
      .from("barracas")
      .select("id, client_id")
      .eq("id", body.barraca_id)
      .single();

    if (barracaErr) {
      return NextResponse.json({ error: barracaErr.message }, { status: 500 });
    }

    if (!barraca?.client_id) {
      return NextResponse.json(
        { error: "barraca sem client_id (configuração inválida)" },
        { status: 500 }
      );
    }

    // 0.1) Gate operacional (F4.8 - modelo C)
    const { error: gateErr } = await supabase.rpc("assert_client_can_checkout", {
      p_client_id: barraca.client_id,
    });

    if (gateErr) {
      const msg = gateErr.message ?? "client_restricted_checkout_blocked";

      if (isOperationalBlock(msg)) {
        return NextResponse.json(
          {
            error: "checkout_bloqueado",
            code: msg.includes("client_blocked") ? "client_blocked" : "client_restricted",
            message:
              "Este estabelecimento está temporariamente com o checkout indisponível. Tente novamente mais tarde.",
          },
          { status: 402 }
        );
      }

      return NextResponse.json({ error: gateErr.message }, { status: 500 });
    }

    const total = body.items.reduce(
      (sum, it) => sum + Number(it.preco_unitario || 0) * Number(it.quantidade || 0),
      0
    );

    // 1) cria o pedido
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

    // 2) cria os itens do pedido
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
