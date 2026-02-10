// app/app/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AppIndex() {
  const example = "9f56ce53-1ec1-4e03-ae4c-64b2b2085e95";

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold tracking-tight">Visão geral</div>
        <div className="mt-1 text-sm text-[color:var(--text-2)]">
          Operação e indicadores do dia (ambiente TEST).
        </div>
      </div>

      <div className="wavie-card p-6">
        <div className="text-sm font-semibold">Conectar barraca</div>
        <div className="mt-2 text-sm text-[color:var(--text-2)]">
          Para testar, acesse:
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={`/app/${example}`}
            className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
          >
            Abrir barraca (exemplo)
          </a>

          <a
            href="/b/nelsaodrinks"
            className="wavie-card px-4 py-3 text-sm hover:bg-[color:var(--surface-2)]"
          >
            Abrir cardápio (nelsaodrinks)
          </a>
        </div>

        <div className="mt-4 text-xs text-[color:var(--muted)]">
          (Temporário. Depois o login definirá automaticamente a barraca.)
        </div>
      </div>
    </div>
  );
}
