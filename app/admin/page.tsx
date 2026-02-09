// app/admin/page.tsx
import { supabase } from "@/lib/supabase";
import AdminClient from "./AdminClient";

type BarracaRow = {
  id: string;
  nome: string | null;
  slug: string | null;
  client_id: string | null;
};

export default async function AdminPage(props: {
  searchParams: { b?: string } | Promise<{ b?: string }>;
}) {
  const sp = await Promise.resolve(props.searchParams);
  const barracaId = (sp.b ?? "").trim();

  const { data: barraca, error } = await supabase
    .from("barracas")
    .select("id,nome,slug,client_id")
    .eq("id", barracaId)
    .maybeSingle<BarracaRow>();

  if (error) throw new Error(error.message);

  return (
    <AdminClient
      initialBarraca={barraca ?? null}
      clientId={barraca?.client_id ?? null}
    />
  );
}
