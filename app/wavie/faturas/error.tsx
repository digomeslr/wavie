"use client";

import { useEffect } from "react";

export default function WavieFaturasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("WAVIE FATURAS ERROR:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-neutral-900">
          Erro ao carregar /wavie/faturas
        </div>

        <div className="mt-2 text-sm text-neutral-700">
          Isso é um erro no server (SSR). Agora a página não fica mais “branca” e
          você consegue ver o digest e tentar novamente.
        </div>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs font-medium text-neutral-600">Mensagem</div>
          <pre className="mt-1 text-xs whitespace-pre-wrap text-neutral-900">
            {error?.message || "Sem mensagem"}
          </pre>

          <div className="mt-3 text-xs text-neutral-700">
            <b>Digest:</b> {error?.digest || "—"}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            Tentar novamente
          </button>

          <a
            href="/wavie"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900"
          >
            Voltar ao menu
          </a>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Próximo passo: abrir Vercel Logs e pegar a linha do erro real (ex.:
          coluna faltando, RPC falhando, permissão etc.). Aí corrigimos de vez.
        </div>
      </div>
    </main>
  );
}
