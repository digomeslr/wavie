// app/menu/page.tsx
import { Suspense } from "react";
import MenuClient from "./MenuClient";

export const dynamic = "force-dynamic";

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50">
          <div className="max-w-xl ml-4 md:ml-8 mr-auto p-4 md:p-6 pb-28">
            <header className="mb-5">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Cardápio
              </h1>
              <p className="text-slate-500 mt-1 text-sm">Carregando…</p>
            </header>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-600 shadow-sm">
              Preparando o cardápio…
            </div>
          </div>
        </main>
      }
    >
      <MenuClient />
    </Suspense>
  );
}
