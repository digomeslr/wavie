// app/app/barraca/[barraca_id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AppHomeClient from "../../AppHomeClient";

export default function AppBarracaPage({
  params,
}: {
  params: { barraca_id: string };
}) {
  // garante string e decodifica
  const barracaId = params?.barraca_id
    ? decodeURIComponent(params.barraca_id)
    : null;

  return <AppHomeClient barracaId={barracaId} />;
}
