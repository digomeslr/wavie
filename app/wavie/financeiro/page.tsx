import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ClientMini = { id: string; name: string | null; slug: string | null };

type InvoiceRow = {
  id: string;
  client_id: string | null;
  month: string; // YYYY-MM-DD
  status: string;
  gross_cents: number | null;
  wavie_fee_cents: number | null;
  paid_at: string | null;
  created_at: string;
  clients?: { id: string; name: string | null; slug: string | null } | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: string | null;
  paid_at: string;
};

function formatBRLFromCents(cents: number) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function firstDayOfMonthISO(month: string) {
  return `${month}-01`;
}

function parseMonthParam(s?: string | null) {
  if (s && /^\d{4}-\d{2}$/.test(s)) return s;
  return monthKey(new Date());
}

function parseStatusParam(s?: string | null) {
  const allowed = new Set(["all", "open", "sent", "paid", "void"]);
  if (s && allowed.has(s)) return s;
  return "all";
}

async function assertWavieAdminOrRedirect(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/wavie/login");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (profErr || !profile || profile.role !== "wavie_admin") redirect("/wavie/login");
}

export default async function WavieFinanceiroPage({
  searchParams,
}: {
  searchParams?: { month?: string; status?: string };
}) {
  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const month = parseMonthParam(searchParams?.month);
  const status = parseStatusParam(searchParams?.status);
  const month_date = firstDayOfMonthISO(month);

  // invoices do mês (com client)
  let invQ = supabase
    .from("invoices")
    .select(
      [
        "id",
        "client_id",
        "month",
        "status",
        "gross_cents",
        "wavie_fee_cents",
        "paid_at",
        "created_at",
        "clients:clients(id,name,slug)",
      ].join(",")
    )
    .eq("month", month_date)
    .order("created_at", { ascending: false })
    .limit(500);

  if (status !== "all") invQ = invQ.eq("status", status);

  const { data: invoicesRaw, error: invErr } = await invQ;
  if (invErr) throw new Error(invErr.message);

  const invoices: InvoiceRow[] = (invoicesRaw ?? []) as any;
  const invoiceIds = invoices.map((i) => i.id);

  // pagamentos das invoices do mês
  let payments: PaymentRow[] = [];
  if (invoiceIds.length > 0) {
    const { data: pays, error: payErr } = await supabase
      .from("invoice_payments")
      .select("id,invoice_id,amount_cents,method,paid_at")
      .in("invoice_id", invoiceIds)
      .order("paid_at", { ascending: false })
      .limit(5000);

    if (payErr) throw new Error(payErr.message);
    payments = (pays ?? []) as any;
  }

  // agrega pago por invoice
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
  }

  // métricas gerais
  let totalGross = 0;
  let totalDue = 0;
  let totalPaid = 0;
  let totalOpen = 0;

  // inadimplência por cliente
  type Debtor = { clientId: string; clientName: string; due: number; paid: number; open: number; invoices: number };
  const debtorByClient = new Map<string, Debtor>();

  for (const inv of invoices) {
    const gross = Number(inv.gross_cents ?? 0);
    const due = Number(inv.wavie_fee_cents ?? 0);
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const open = Math.max(due - paid, 0);

    totalGross += gross;
    totalDue += due;
    totalPaid += paid;
    totalOpen += open;

    const clientId = inv.client_id ?? "—";
    const clientName = inv.clients?.name ?? inv.clients?.slug ?? inv.client_id ?? "—";

    const key = clientId;
    const prev = debtorByClient.get(key);
    if (!prev) {
      debtorByClient.set(key, { clientId, clientName, due, paid, open, invoices: 1 });
    } else {
      prev.due += due;
      prev.paid += paid;
      prev.open += open;
      prev.invoices += 1;
    }
  }

  const topDebtors = Array.from(debtorByClient.values())
    .filter((d) => d.open > 0)
    .sort((a, b) => b.open - a.open)
    .slice(0, 12);

  const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "2px solid #000",
          background: "#d1ecf1",
          marginBottom: 12,
          fontWeight: 900,
        }}
      >
        ✅ BUILD MARKER: FINANCEIRO WAVIE (Mês / Recebido / Em aberto / Inadimplentes)
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Financeiro (Wavie)</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Mês: <b>{month}</b> • Filtro status: <b>{status}</b>
          </p>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 12 }}>
            Base: invoices + invoice_payments • Devido = wavie_fee_cents • Pago = soma dos pagamentos • Em aberto = devido − pago
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/wavie"
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              textDecoration: "none",
              background: "white",
            }}
          >
            Voltar
          </Link>
          <Link
            href="/wavie/faturas"
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              textDecoration: "none",
              background: "white",
            }}
          >
            Faturas
          </Link>
          <Link
            href="/logout"
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              textDecoration: "none",
              background: "white",
            }}
          >
            Sair
          </Link>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Filtros</div>

          <form action="/wavie/financeiro" method="get" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              name="month"
              type="month"
              defaultValue={month}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                width: 160,
              }}
            />

            <select
              name="status"
              defaultValue={status}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "white",
              }}
            >
              {(["all", "open", "sent", "paid", "void"] as const).map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "Todos" : s}
                </option>
              ))}
            </select>

            <button
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "white",
                cursor: "pointer",
              }}
            >
              Aplicar
            </button>
          </form>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* KPIs */}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Kpi title="Bruto (clientes)" value={formatBRLFromCents(totalGross)} hint="Soma de gross_cents no mês" />
        <Kpi title="Devido à Wavie" value={formatBRLFromCents(totalDue)} hint="Soma de wavie_fee_cents no mês" />
        <Kpi title="Recebido (Wavie)" value={formatBRLFromCents(totalPaid)} hint="Soma de invoice_payments.amount_cents" />
        <Kpi title="Em aberto" value={formatBRLFromCents(totalOpen)} hint="Devido − Pago" />
        <Kpi title="% Recebido" value={`${paidPct}%`} hint="Pago / Devido" />
        <Kpi title="Faturas no mês" value={`${invoices.length}`} hint="Quantidade de invoices no filtro" />
      </div>

      <div style={{ height: 14 }} />

      {/* Inadimplentes */}
      <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Top inadimplentes (por saldo em aberto)</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Ajuda a priorizar cobrança / follow-up.
        </div>

        <div style={{ height: 12 }} />

        {topDebtors.length === 0 ? (
          <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)" }}>
            Nenhum cliente com saldo em aberto neste filtro.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {topDebtors.map((d) => (
              <div
                key={d.clientId}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "rgba(0,0,0,0.02)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{d.clientName}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Faturas no filtro: {d.invoices}</div>
                </div>

                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <MiniStat label="Devido" value={formatBRLFromCents(d.due)} />
                  <MiniStat label="Pago" value={formatBRLFromCents(d.paid)} />
                  <MiniStat label="Em aberto" value={formatBRLFromCents(d.open)} strong />
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
                  <Link
                    href={`/wavie/faturas?month=${encodeURIComponent(month)}&status=all`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.15)",
                      textDecoration: "none",
                      background: "white",
                      fontSize: 13,
                    }}
                  >
                    Ver faturas
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white" }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>{hint}</div>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: strong ? 900 : 700 }}>{value}</div>
    </div>
  );
}
