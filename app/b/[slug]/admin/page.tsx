// app/b/[slug]/admin/page.tsx
import { redirect, notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BarracaRow = {
  id: string;
  slug: string | null;
};

export default async function BarracaAdminResolverPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeURIComponent(params.slug ?? "").trim();

  // Busca permissiva (robusta)
  const { data, error } = await supabase
    .from("barracas")
    .select("id,slug")
    .ilike("slug", `%${slug}%`)
    .limit(5);

  if (error) throw new Error(error.message);

  // Se só achou 1, redireciona
  if (data && data.length === 1 && data[0]?.id) {
    redirect(`/admin?b=${data[0].id}`);
  }

  // Se achou exato entre os candidatos, redireciona
  const exact = (data ?? []).find((b) => (b.slug ?? "").trim() === slug) as
    | BarracaRow
    | undefined;

  if (exact?.id) {
    redirect(`/admin?b=${exact.id}`);
  }

  // Se não achou nada (ou ficou ambíguo)
  notFound();
}
