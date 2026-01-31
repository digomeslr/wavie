// app/b/[slug]/page.tsx
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BarracaRow = {
  id: string;
  slug: string | null;
  nome: string | null;
};

function normalizeSlug(input: string) {
  return (
    input
      .trim()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[–—−]/g, "-")
  );
}

export default async function BarracaMenuResolverPage({
  params,
}: {
  params: { slug: string };
}) {
  const raw = params.slug ?? "";
  const decoded = decodeURIComponent(raw);
  const target = normalizeSlug(decoded);

  // 1) tenta match exato (normalizado)
  const { data: all, error } = await supabase
    .from("barracas")
    .select("id,slug,nome")
    .limit(50);

  if (error) throw new Error(error.message);

  const exact = (all ?? []).find((b) => normalizeSlug(b.slug ?? "") === target);

  if (exact?.id) {
    redirect(`/menu?b=${exact.id}`);
  }

  // 2) busca permissiva (se tiver 1 candidata, vai direto)
  const { data: candidatos, error: e2 } = await supabase
    .from("barracas")
    .select("id,slug,nome")
    .ilike("slug", `%${decoded.trim()}%`)
    .limit(10);

  if (e2) throw new Error(e2.message);

  if (candidatos && candidatos.length === 1 && candidatos[0]?.id) {
    redirect(`/menu?b=${candidatos[0].id}`);
  }

  // 3) diagnóstico (em vez de 404 cego)
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold">Barraca não encontrada</h1>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <div className="text-zinc-400">Slug recebido</div>
          <div className="mt-1 font-mono text-zinc-200">{decoded}</div>

          <div className="mt-3 text-zinc-400">Slug normalizado</div>
          <div className="mt-1 font-mono text-zinc-200">{target}</div>

          <div className="mt-4 text-zinc-400">
            Candidatos encontrados (busca permissiva)
          </div>
          <div className="mt-2 space-y-2">
            {(candidatos ?? []).map((b) => (
              <div
                key={b.id}
                className="rounded-lg bg-zinc-950/40 p-3 border border-zinc-800"
              >
                <div className="text-zinc-200">{b.nome ?? "—"}</div>
                <div className="mt-1 text-xs font-mono text-zinc-400">{b.slug ?? "—"}</div>
                <div className="mt-1 text-xs font-mono text-zinc-500">{b.id}</div>
              </div>
            ))}
            {(!candidatos || candidatos.length === 0) && (
              <div className="text-zinc-500">Nenhum candidato.</div>
            )}
          </div>

          <div className="mt-5 text-zinc-400">Exemplos de slugs no banco (até 10)</div>
          <div className="mt-2 space-y-1">
            {(all ?? []).slice(0, 10).map((b) => (
              <div key={b.id} className="text-xs font-mono text-zinc-300">
                {b.slug ?? "—"}
              </div>
            ))}
          </div>

          <div className="mt-5 text-zinc-500">
            Se o slug existir e mesmo assim não achar, pode ser caractere invisível no slug salvo.
          </div>
        </div>
      </div>
    </div>
  );
}
