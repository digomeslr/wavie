// app/app/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import AppHomeClient from "./AppHomeClient";

export default function AppPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams?.barraca_id;
  const barracaId = Array.isArray(raw) ? raw[0] : raw;

  return <AppHomeClient barracaId={barracaId ?? null} />;
}
