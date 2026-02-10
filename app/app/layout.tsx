// app/app/layout.tsx
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wavie-bg min-h-screen">
      {/* Topbar */}
      <header className="wavie-topbar">
        <div className="wavie-topbar-inner">
          <div className="flex items-center gap-3">
            <div className="wavie-mark" aria-hidden="true" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Wavie</div>
              <div className="text-xs text-[color:var(--muted)]">
                Painel do cliente
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="wavie-pill">
              Status: <strong className="ml-1">Ativa</strong>
            </span>
            <a href="/wavie/logout" className="wavie-pill hover:opacity-90">
              Sair
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="wavie-container py-8">
        {/* ESSENCIAL: sem isso, as páginas /app/* não aparecem */}
        {children}
      </main>
    </div>
  );
}
