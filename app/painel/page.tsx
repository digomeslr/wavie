// app/painel/page.tsx
import { Suspense } from "react";
import PainelClient from "./PainelClient";

export const dynamic = "force-dynamic";

export default function PainelPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50">
          <div className="px-4 md:px-6 py-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-slate-500">Carregando painel…</div>
            </div>
          </div>
        </main>
      }
    >
      <PainelClient />
    </Suspense>
  );
}
