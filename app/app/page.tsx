// app/app/page.tsx
import AppHomeClient from "./AppHomeClient";

export default async function AppPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams?.barraca_id;
  const barracaId = Array.isArray(raw) ? raw[0] : raw;

  return <AppHomeClient barracaId={barracaId ?? null} />;
}
