
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type BodyItem = {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
};

export async function POST(req: Request) {
  try {
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
    const itens = body.items.map((it) => ({
      pedido_id: pedido.id,
      produto_id: it.produto_id,
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
    }));

    const { error: itensErr } = await supabase.from("itens_pedido").insert(itens);

    if (itensErr) {
      // se falhar itens, cancela o pedido para não ficar "solto"
      await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      return NextResponse.json({ error: itensErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: pedido.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

