import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default async function WavieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ⚠️ Nota: seu projeto usa um supabase singleton anon (sem cookies server-side),
  // então aqui no server não conseguimos "ver" o user logado de forma confiável.
  // Por isso, este layout só mantém a casca visual.
  // O bloqueio real (role wavie_admin) será feito client-side no /wavie (próximo passo).
  // Se você tentar forçar auth aqui, vai quebrar.

  // Mantemos a área disponível e o guard fica na página /wavie (client).
  void supabase; // evita lint de import não usado caso seu setup seja estrito

  return <div className="min-h-screen bg-neutral-50">{children}</div>;
}
