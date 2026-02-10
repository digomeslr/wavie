// app/app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wavie App",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E6EDF7]">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-[#1E2A3B] bg-[#0B0F14]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl border border-[#1E2A3B] bg-[#101826]" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Wavie</div>
              <div className="text-xs text-[#9FB0C6]">Painel do cliente</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status da conta (mock) */}
            <span className="rounded-full border border-[#1E2A3B] bg-[#101826] px-3 py-1 text-xs text-[#9FB0C6]">
              Status: <span className="text-[#E6EDF7]">Ativa</span>
            </span>

            <button className="rounded-xl border border-[#1E2A3B] bg-[#101826] px-3 py-2 text-xs text-[#E6EDF7] hover:bg-[#0E1623]">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
