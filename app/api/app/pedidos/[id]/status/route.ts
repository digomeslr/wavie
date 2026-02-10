import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FLOW: Record<string, string> = {
  recebido: "preparando",
  preparando: "pronto",
  pronto: "entregue",
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = supabaseAdmin();

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const body = (await req.json()) as { next_status?: string };
    const next = (body?.next_status ?? "").toLowerCase().trim();

    if (!next) {
      return NextResponse.json({ error: "next_status obrigatório" }, { status: 400 });
    }

    // status atual
    const { data: pedido, error: selErr } = await supabase
      .from("pedidos")
      .select("id,status")
      .eq("id", id)
      .single();

    if (selErr || !pedido) {
      return NextResponse.json(
        { error: selErr?.message ?? "pedido não encontrado" },
        { status: 404 }
      );
    }

    const current = String(pedido.status ?? "").toLowerCase().trim() || "recebido";
    const allowedNext = FLOW[current];

    if (!allowedNext) {
      return NextResponse.json({ error: "status_atual_invalido" }, { status: 400 });
    }

    if (next !== allowedNext) {
      return NextResponse.json(
        { error: "transicao_invalida", current_status: current, allowed_next: allowedNext },
        { status: 409 }
      );
    }

    const { data: updated, error: updErr } = await supabase
      .from("pedidos")
      .update({ status: next })
      .eq("id", id)
      .select("id,status,local,created_at,barraca_id")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
