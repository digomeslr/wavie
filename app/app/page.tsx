// app/app/page.tsx
function StatCard({
    label,
    value,
    hint,
  }: {
    label: string;
    value: string;
    hint?: string;
  }) {
    return (
      <div className="rounded-2xl border border-[#1E2A3B] bg-[#101826] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
        <div className="text-xs text-[#9FB0C6]">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="mt-1 text-xs text-[#6B7C93]">{hint}</div> : null}
      </div>
    );
  }
  
  function OrderEmptyState() {
    return (
      <div className="rounded-2xl border border-[#1E2A3B] bg-[#101826] p-6">
        <div className="text-sm font-semibold">Pedidos</div>
        <div className="mt-1 text-sm text-[#9FB0C6]">
          Nenhum pedido no momento.
        </div>
  
        <div className="mt-5 rounded-2xl border border-[#1E2A3B] bg-[#0E1623] p-4 text-sm text-[#9FB0C6]">
          Quando um pedido entrar, ele aparecerá aqui com itens sempre visíveis,
          status claro e ações rápidas (mobile/tablet first).
        </div>
      </div>
    );
  }
  
  export default function AppHome() {
    return (
      <div className="space-y-6">
        {/* Header da página */}
        <div>
          <div className="text-xl font-semibold tracking-tight">Visão geral</div>
          <div className="mt-1 text-sm text-[#9FB0C6]">
            Operação e indicadores do dia (ambiente TEST).
          </div>
        </div>
  
        {/* Métricas (vazias por enquanto) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pedidos hoje" value="—" />
          <StatCard label="Faturamento hoje" value="—" />
          <StatCard label="Ticket médio" value="—" />
          <StatCard label="Em preparo" value="—" />
        </div>
  
        {/* Ações rápidas */}
        <div className="flex flex-wrap gap-3">
          <a
            href="/app/billing"
            className="rounded-2xl border border-[#1E2A3B] bg-[#101826] px-4 py-3 text-sm hover:bg-[#0E1623]"
          >
            Ver cobrança
          </a>
  
          <a
            href="/b/seu-slug-aqui"
            className="rounded-2xl border border-[#1E2A3B] bg-[#101826] px-4 py-3 text-sm hover:bg-[#0E1623]"
          >
            Abrir cardápio (teste)
          </a>
        </div>
  
        {/* Lista de pedidos (estado vazio por enquanto) */}
        <OrderEmptyState />
      </div>
    );
  }
  