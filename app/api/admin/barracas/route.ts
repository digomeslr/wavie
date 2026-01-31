// app/api/admin/barracas/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const barracaId = String(body?.barracaId ?? "").trim();
    const nome = String(body?.nome ?? "").trim();
    const slugRaw = String(body?.slug ?? "").trim();

    if (!barracaId) {
      return NextResponse.json({ error: "barracaId é obrigatório" }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
    }

    const slug = slugRaw ? normalizeSlug(slugRaw) : "";

    if (!slug) {
      return NextResponse.json({ error: "slug é obrigatório" }, { status: 400 });
    }
    if (slug.length < 3) {
      return NextResponse.json({ error: "slug muito curto" }, { status: 400 });
    }

    // 1) checar colisão de slug (outra barraca com mesmo slug)
    const { data: existing, error: existErr } = await supabase
      .from("barracas")
      .select("id")
      .eq("slug", slug)
      .maybeSingle<{ id: string }>();

    if (existErr) {
      return NextResponse.json({ error: existErr.message }, { status: 500 });
    }
    if (existing && existing.id !== barracaId) {
      return NextResponse.json({ error: "Esse slug já está em uso." }, { status: 409 });
    }

    // 2) atualizar
    const { data: updated, error: updErr } = await supabase
      .from("barracas")
      .update({ nome, slug })
      .eq("id", barracaId)
      .select("id,nome,slug")
      .maybeSingle<{ id: string; nome: string | null; slug: string | null }>();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Barraca não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, barraca: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
  }
}
