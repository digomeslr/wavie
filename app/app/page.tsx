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
      <div className="wavie-card p-4">
        <div className="text-xs text-[color:var(--text-2)]">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? (
          <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
        ) : null}
      </div>
    );
  }
  
  function EmptyOrders() {
    return (
      <div className="wavie-card p-6">
        <div className="text-sm font-semibold">Pedidos</div>
        <div className="mt-1 text-sm text-[color:var(--text-2)]">
          Nenhum pedido no momento.
        </div>
  
        <div className="mt-4 wavie-card-soft p-4 text-sm text-[color:var(--text-2)]">
          Este painel é{" "}
          <strong className="text-[color:var(--text)]">operacional</strong>. Quando
          um pedido entrar, ele aparecerá aqui em tempo real, com{" "}
          <strong className="text-[color:var(--text)]">
            itens sempre visíveis
          </strong>
          , status claro e ações rápidas.
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Otimizado para uso contínuo em celular e tablet.
          </div>
        </div>
      </div>
    );
  }
  
  export default function AppHome() {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="text-xl font-semibold tracking-tight">Visão geral</div>
          <div className="mt-1 text-sm text-[color:var(--text-2)]">
            Operação e indicadores do dia (ambiente TEST).
          </div>
        </div>
  
        {/* Métricas */}
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
            className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
          >
            Ver cobrança
          </a>
  
          <a
            href="/b/seu-slug-aqui"
            className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
          >
            Abrir cardápio (teste)
          </a>
        </div>
  
        {/* Lista de pedidos (estado vazio) */}
        <EmptyOrders />
      </div>
    );
  }
  