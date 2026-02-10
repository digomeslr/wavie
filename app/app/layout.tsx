// app/app/layout.tsx
import type { Metadata } from "next";
import "./theme.css";

export const metadata: Metadata = {
  title: "Wavie App",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wavie-app min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-1)]" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Wavie</div>
              <div className="text-xs text-[color:var(--text-2)]">
                Painel do cliente
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status da conta (mock) */}
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-1 text-xs text-[color:var(--text-2)]">
              Status: <span className="text-[color:var(--text)]">Ativa</span>
            </span>

            <button className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-2 text-xs text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
