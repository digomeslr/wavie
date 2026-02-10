import AppHomeClient from "../AppHomeClient";

export default function Page({ params }: { params: { barraca_id?: string } }) {
  return <AppHomeClient barracaId={params?.barraca_id ?? null} />;
}
