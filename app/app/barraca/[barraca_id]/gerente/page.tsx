import GerenteClient from "@/app/app/gerente/GerenteClient";

export default function Page({ params }: { params: { barraca_id: string } }) {
  return <GerenteClient initialBarracaId={params?.barraca_id ?? null} />;
}
