// app/app/barraca/[barraca_id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AppHomeClient from "../../AppHomeClient";

export default function AppBarracaPage({
  params,
}: {
  params: { barraca_id: string };
}) {
  const barracaId = params?.barraca_id
    ? decodeURIComponent(params.barraca_id)
    : null;

  return (
    <>
      {/* MARCADOR: se você NÃO ver isso na tela, essa rota não está sendo usada */}
      <div className="wavie-card p-3 text-xs text-[color:var(--muted)]">
        ROUTE_OK: /app/barraca/[barraca_id] • param:{" "}
        <span className="text-[color:var(--text)]">{barracaId ?? "null"}</span>
      </div>

      <div className="mt-4">
        <AppHomeClient barracaId={barracaId} />
      </div>
    </>
  );
}
