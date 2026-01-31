// app/api/admin/produtos/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function cleanName(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

// Aceita preço como number ou string ("12,50" / "12.50")
function parsePrice(input: any) {
  if (typeof input === "number") return input;
  const s = String(input ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", "."); // "1.234,50" -> "1234.50"
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// GET /api/admin/produtos?b=<barraca_id>
// (opcional) &categoria=<categoria_id>
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barracaId = (searchParams.get("b") ?? "").trim();
    const categoriaId = (searchParams.get("categoria") ?? "").trim();

    if (!barracaId) {
      return NextResponse.json({ error: "Parâmetro b (barraca_id) é obrigatório." }, { status: 400 });
    }

    let q = supabase
      .from("produtos")
      .select("id,barraca_id,categoria_id,nome,preco,ativo,created_at")
      .eq("barraca_id", barracaId)
      .order("created_at", { ascending: true });

    if (categoriaId) q = q.eq("categoria_id", categoriaId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, produtos: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

// POST /api/admin/produtos
// { barracaId, categoriaId, nome, preco, ativo? }
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const barracaId = String(body?.barracaId ?? "").trim();
    const categoriaId = String(body?.categoriaId ?? "").trim();
    const nome = cleanName(String(body?.nome ?? ""));
    const preco = parsePrice(body?.preco);
    const ativo = typeof body?.ativo === "boolean" ? body.ativo : true;

    if (!barracaId) return NextResponse.json({ error: "barracaId é obrigatório." }, { status: 400 });
    if (!categoriaId) return NextResponse.json({ error: "categoriaId é obrigatório." }, { status: 400 });
    if (!nome) return NextResponse.json({ error: "nome é obrigatório." }, { status: 400 });
    if (preco === null) return NextResponse.json({ error: "preço inválido." }, { status: 400 });

    const { data, error } = await supabase
      .from("produtos")
      .insert({
        barraca_id: barracaId,
        categoria_id: categoriaId,
        nome,
        preco,
        ativo,
      })
      .select("id,barraca_id,categoria_id,nome,preco,ativo,created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, produto: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}

// PATCH /api/admin/produtos
// { barracaId, id, categoriaId?, nome?, preco?, ativo? }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const barracaId = String(body?.barracaId ?? "").trim();
    const id = String(body?.id ?? "").trim();

    if (!barracaId) return NextResponse.json({ error: "barracaId é obrigatório." }, { status: 400 });
    if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

    const update: any = {};
    if (typeof body?.categoriaId === "string") update.categoria_id = body.categoriaId.trim();
    if (typeof body?.nome === "string") update.nome = cleanName(body.nome);
    if (body?.preco !== undefined) {
      const p = parsePrice(body.preco);
      if (p === null) return NextResponse.json({ error: "preço inválido." }, { status: 400 });
      update.preco = p;
    }
    if (typeof body?.ativo === "boolean") update.ativo = body.ativo;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("produtos")
      .update(update)
      .eq("id", id)
      .eq("barraca_id", barracaId)
      .select("id,barraca_id,categoria_id,nome,preco,ativo,created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Produto não encontrado (ou não pertence à barraca)." }, { status: 404 });

    return NextResponse.json({ ok: true, produto: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
