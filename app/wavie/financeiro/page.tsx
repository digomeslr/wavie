import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type InvoiceRow = {
  id: string;
  client_id: string | null;
  month: string; // YYYY-MM-DD
  status: string;
  gross_cents: number | null;
  wavie_fee_cents: number | null;
  paid_at: string | null;
  created_at: string;
  locked_at: string | null;
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

function pill(bg: string, fg: string) {
  return {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.10)",
    background: bg,
    color: fg,
    fontWeight: 800 as const,
    letterSpacing: 0.2,
  };
}

function card() {
  return {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "white",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  };
}

function subtleCard() {
  return {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.02)",
  };
}

function divider() {
  return { height: 1, background: "rgba(0,0,0,0.08)", margin: "12px 0" };
}

/** ✅ Filtros robustos: server action + redirect */
async function applyFiltersAction(formData: FormData) {
  "use server";

  const month = String(formData.get("month") ?? "").trim();
  const status = String(formData.get("status") ?? "all").trim();

  const allowed = new Set(["all", "open", "sent", "paid", "void"]);
  const safeStatus = allowed.has(status) ? status : "all";
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());

  redirect(`/wavie/financeiro?month=${encodeURIComponent(safeMonth)}&status=${encodeURIComponent(safeStatus)}`);
}

async function closeMonthAction(formData: FormData) {
  "use server";

  const month = String(formData.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido");

  const month_date = firstDayOfMonthISO(month);

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const { error } = await supabase
    .from("invoices")
    .update({ locked_at: new Date().toISOString() })
    .eq("month", month_date)
    .is("locked_at", null);

  if (error) {
    console.error("WAVIE/FINANCEIRO closeMonthAction FAILED:", error);
    throw new Error("CLOSE_MONTH_FAILED");
  }

  revalidatePath(`/wavie/financeiro?month=${encodeURIComponent(month)}&status=all`);
  revalidatePath(`/wavie/faturas?month=${encodeURIComponent(month)}&status=all`);
  redirect(`/wavie/financeiro?month=${encodeURIComponent(month)}&status=all`);
}

export default async function WavieFinanceiroPage({
  searchParams,
}: {
  // ✅ Next 16: searchParams pode vir como Promise
  searchParams?: Promise<{ month?: string; status?: string }> | { month?: string; status?: string };
}) {
  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const sp =
    searchParams && typeof (searchParams as any).then === "function"
      ? await (searchParams as Promise<{ month?: string; status?: string }>)
      : (searchParams as { month?: string; status?: string } | undefined);

  const month = parseMonthParam(sp?.month);
  const status = parseStatusParam(sp?.status);
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
        "locked_at",
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

  // lock status do mês
  const totalInvoices = invoices.length;
  const lockedCount = invoices.filter((i) => i.locked_at).length;
  const isFullyLocked = totalInvoices > 0 && lockedCount === totalInvoices;
  const isPartiallyLocked = lockedCount > 0 && lockedCount < totalInvoices;

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

    const prev = debtorByClient.get(clientId);
    if (!prev) debtorByClient.set(clientId, { clientId, clientName, due, paid, open, invoices: 1 });
    else {
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

  // ✅ % recebido capped
  const paidForPct = Math.min(totalPaid, totalDue);
  const paidPct = totalDue > 0 ? Math.round((paidForPct / totalDue) * 100) : 0;

  const bg = {
    background:
      "radial-gradient(1200px 600px at 15% 10%, rgba(0,0,0,0.06), transparent 60%), radial-gradient(900px 500px at 85% 30%, rgba(0,0,0,0.05), transparent 55%), #fafafa",
    minHeight: "100vh",
  } as const;

  return (
    <div style={bg}>
      <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            ...card(),
            padding: 14,
            background: "linear-gradient(90deg, rgba(209,236,241,1), rgba(255,255,255,1))",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>WAVIE • FINANCEIRO</div>
              <div style={{ fontSize: 24, fontWeight: 1000, marginTop: 2 }}>Painel Financeiro</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                Mês <b>{month}</b> • Status <b>{status}</b> • Base: invoices + invoice_payments
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Devido = wavie_fee_cents</span>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Pago = soma payments</span>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Em aberto = devido − pago</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link
                href="/wavie"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  textDecoration: "none",
                  background: "white",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                Voltar
              </Link>
              <Link
                href={`/wavie/faturas?month=${encodeURIComponent(month)}&status=all`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  textDecoration: "none",
                  background: "white",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                Abrir Faturas
              </Link>
              <Link
                href="/logout"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.14)",
                  textDecoration: "none",
                  background: "white",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                Sair
              </Link>
            </div>
          </div>

          <div style={divider()} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <form action={applyFiltersAction} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Mês</span>
                <input
                  name="month"
                  type="month"
                  defaultValue={month}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                    width: 180,
                    fontWeight: 800,
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Status</span>
                <select
                  name="status"
                  defaultValue={status}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "white",
                    fontWeight: 800,
                  }}
                >
                  {(["all", "open", "sent", "paid", "void"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "Todos" : s}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", alignItems: "end" }}>
                <button
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    minWidth: 140,
                  }}
                >
                  Aplicar
                </button>
              </div>
            </form>

            <div style={{ display: "flex", alignItems: "end" }}>
              <span
                style={pill(
                  isFullyLocked ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.18)",
                  isFullyLocked ? "#065f46" : "#7c2d12"
                )}
              >
                {totalInvoices === 0
                  ? "SEM FATURAS NO MÊS"
                  : isFullyLocked
                  ? `MÊS FECHADO • ${lockedCount}/${totalInvoices}`
                  : isPartiallyLocked
                  ? `PARCIALMENTE FECHADO • ${lockedCount}/${totalInvoices}`
                  : `MÊS ABERTO • ${lockedCount}/${totalInvoices}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Kpi title="Bruto (clientes)" value={formatBRLFromCents(totalGross)} hint="Soma de gross_cents no mês" />
          <Kpi title="Devido à Wavie" value={formatBRLFromCents(totalDue)} hint="Soma de wavie_fee_cents no mês" />
          <Kpi title="Recebido (Wavie)" value={formatBRLFromCents(totalPaid)} hint="Soma de invoice_payments.amount_cents" />
          <Kpi title="Em aberto" value={formatBRLFromCents(totalOpen)} hint="Devido − Pago" />
          <Kpi title="% Recebido" value={`${paidPct}%`} hint="Pago / Devido (cap em 100%)" />
          <Kpi title="Faturas no mês" value={`${invoices.length}`} hint="Quantidade de invoices no filtro" />
        </div>

        <div style={{ height: 14 }} />

        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 1000 }}>Fechamento do mês</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75, lineHeight: 1.45 }}>
                Ao fechar o mês, as faturas e os pagamentos daquele mês ficam <b>congelados</b> (lock no banco).
                <br />
                Isso impede alterações retroativas e cria governança contábil real.
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Bloqueia edits em invoices</span>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Bloqueia inserts/edits em payments</span>
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>Auditável: locked_at</span>
              </div>
            </div>

            <div style={{ minWidth: 320 }}>
              <div style={subtleCard()}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>STATUS DO MÊS</div>
                    <div style={{ fontSize: 18, fontWeight: 1000, marginTop: 2 }}>
                      {totalInvoices === 0 ? "Sem faturas" : isFullyLocked ? "Fechado" : isPartiallyLocked ? "Parcial" : "Aberto"}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                      Faturas locked: <b>{lockedCount}</b> / <b>{totalInvoices}</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center" }}>
                    <form action={closeMonthAction}>
                      <input type="hidden" name="month" value={month} />
                      <button
                        disabled={totalInvoices === 0 || isFullyLocked}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 14,
                          border: "1px solid rgba(0,0,0,0.14)",
                          background: totalInvoices === 0 || isFullyLocked ? "rgba(0,0,0,0.15)" : "black",
                          color: "white",
                          cursor: totalInvoices === 0 || isFullyLocked ? "not-allowed" : "pointer",
                          fontWeight: 1000,
                          minWidth: 160,
                        }}
                      >
                        {isFullyLocked ? "Mês já fechado" : "Fechar mês"}
                      </button>
                    </form>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
                  {totalInvoices === 0 ? (
                    <>Crie/gerencie as faturas em “Faturas” antes de fechar.</>
                  ) : isFullyLocked ? (
                    <>
                      Mês fechado. Alterações retroativas estão bloqueadas pelo banco.
                      <br />
                      Se precisar ajustar algo, o próximo passo é um fluxo de <b>override</b>.
                    </>
                  ) : (
                    <>
                      Recomendação: confira inadimplentes, valide pagamentos e só então feche.
                      <br />
                      Depois de fechado, não dá para registrar pagamento manual retroativo.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 1000 }}>Top inadimplentes</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                Ordenado por <b>saldo em aberto</b>. Priorize cobrança.
              </div>
            </div>

            <Link
              href={`/wavie/faturas?month=${encodeURIComponent(month)}&status=open`}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.14)",
                textDecoration: "none",
                background: "white",
                fontSize: 13,
                fontWeight: 900,
                height: "fit-content",
              }}
            >
              Ver abertas
            </Link>
          </div>

          <div style={divider()} />

          {topDebtors.length === 0 ? (
            <div style={subtleCard()}>Nenhum cliente com saldo em aberto neste filtro.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {topDebtors.map((d) => (
                <div
                  key={d.clientId}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: "rgba(0,0,0,0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 260 }}>
                    <div style={{ fontSize: 15, fontWeight: 1000 }}>{d.clientName}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      Faturas no filtro: <b>{d.invoices}</b>
                    </div>
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
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.14)",
                        textDecoration: "none",
                        background: "white",
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      Abrir faturas
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 18 }} />
      </div>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "white",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 1000, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: strong ? 1000 : 800 }}>{value}</div>
    </div>
  );
}
