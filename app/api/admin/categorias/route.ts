// app/api/admin/categorias/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function cleanName(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

// GET /api/admin/categorias?b=<barraca_id>
// POST /api/admin/categorias  { barracaId, nome }
// PATCH /api/admin/categorias { barracaId, id, nome }
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barracaId = (searchParams.get("b") ?? "").trim();
    if (!barracaId) {
      return NextResponse.json({ error: "Parâmetro b (barraca_id) é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("categorias")
      .select("id,barraca_id,nome,created_at")
      .eq("barraca_id", barracaId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, categorias: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const barracaId = String(body?.barracaId ?? "").trim();
    const nome = cleanName(String(body?.nome ?? ""));

    if (!barracaId) {
      return NextResponse.json({ error: "barracaId é obrigatório." }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ error: "nome é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("categorias")
      .insert({
        barraca_id: barracaId,
        nome,
      })
      .select("id,barraca_id,nome,created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, categoria: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const barracaId = String(body?.barracaId ?? "").trim();
    const id = String(body?.id ?? "").trim();
    const nomeRaw = body?.nome;

    if (!barracaId) return NextResponse.json({ error: "barracaId é obrigatório." }, { status: 400 });
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const update: any = {};
    if (typeof nomeRaw === "string") update.nome = cleanName(nomeRaw);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("categorias")
      .update(update)
      .eq("id", id)
      .eq("barraca_id", barracaId)
      .select("id,barraca_id,nome,created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Categoria não encontrada (ou não pertence à barraca)." }, { status: 404 });

    return NextResponse.json({ ok: true, categoria: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
