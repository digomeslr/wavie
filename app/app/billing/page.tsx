// app/app/billing/page.tsx
function Card({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="rounded-2xl border border-[#1E2A3B] bg-[#101826] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-3 text-sm text-[#9FB0C6]">{children}</div>
      </div>
    );
  }
  
  export default function BillingPage() {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="text-xl font-semibold tracking-tight">Cobrança</div>
          <div className="mt-1 text-sm text-[#9FB0C6]">
            Assinatura e pagamentos do Wavie (ambiente TEST).
          </div>
        </div>
  
        {/* Status da conta */}
        <Card title="Status da conta">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[#E6EDF7]">Conta ativa</div>
              <div className="text-xs text-[#6B7C93]">
                Nenhuma ação necessária no momento.
              </div>
            </div>
            <span className="rounded-full border border-[#1E2A3B] bg-[#0E1623] px-3 py-1 text-xs text-[#E6EDF7]">
              Ativa
            </span>
          </div>
        </Card>
  
        {/* Resumo da assinatura */}
        <Card title="Resumo da assinatura">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-[#6B7C93]">Plano</div>
              <div className="text-[#E6EDF7]">Wavie — Barracas (TEST)</div>
            </div>
            <div>
              <div className="text-xs text-[#6B7C93]">Valor mensal</div>
              <div className="text-[#E6EDF7]">—</div>
            </div>
            <div>
              <div className="text-xs text-[#6B7C93]">Comissão</div>
              <div className="text-[#E6EDF7]">—</div>
            </div>
            <div>
              <div className="text-xs text-[#6B7C93]">Próxima cobrança</div>
              <div className="text-[#E6EDF7]">—</div>
            </div>
          </div>
        </Card>
  
        {/* Fatura atual */}
        <Card title="Fatura atual">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[#E6EDF7]">Nenhuma fatura em aberto</div>
              <div className="text-xs text-[#6B7C93]">
                Quando existir, ela aparecerá aqui.
              </div>
            </div>
            <button
              disabled
              className="cursor-not-allowed rounded-xl border border-[#1E2A3B] bg-[#0E1623] px-4 py-2 text-sm text-[#9FB0C6]"
            >
              Gerenciar pagamento
            </button>
          </div>
        </Card>
  
        {/* Histórico */}
        <Card title="Histórico de faturas">
          <div className="text-xs text-[#6B7C93]">
            Histórico disponível quando houver cobranças.
          </div>
        </Card>
      </div>
    );
  }
  