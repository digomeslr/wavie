// deploy-bump: ensure /admin/billing exists

import Link from "next/link";

export default function AdminBillingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <div className="text-sm text-zinc-400">Admin • Cobrança</div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Esta área é o destino do CTA “Regularizar agora”.
            Em seguida vamos evoluir aqui para listar faturas, status e atalhos de pagamento.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm font-semibold">Próximos passos (já na fila)</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            <li>Listar invoices do cliente (open/sent/paid)</li>
            <li>Atalho “abrir no Stripe” por invoice</li>
            <li>Histórico + tentativas + retry</li>
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Voltar ao Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


