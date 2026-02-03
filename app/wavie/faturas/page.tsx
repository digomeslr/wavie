import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createInvoicePayment } from "./actions";
import RegisterPaymentModalClient from "./register-payment-modal-client";

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
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
  } = await supabase.auth.getUser();

  if (!user) redirect("/wavie/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (!profile || profile.role !== "wavie_admin") redirect("/wavie/login");
}

type InvoiceSchema = {
  monthCol: string | null;
  statusCol: string | null;
  amountDueCol: string | null;
  paidAtCol: string | null;
  createdAtCol: string | null;
  clientIdCol: string | null;
  commissionCol: string | null;
  fixedFeeCol: string | null;
};

function hasOwn(o: any, k: string) {
  return o && Object.prototype.hasOwnProperty.call(o, k);
}

/**
 * Detecta colunas reais a partir de 1 linha de invoices.
 * Se tabela estiver vazia, retorna tudo null (e a página não quebra).
 */
async function detectInvoicesSchema(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<InvoiceSchema> {
  const { data: sample, error } = await supabase.from("invoices").select("*").limit(1).maybeSingle<any>();
  if (error || !sample) {
    return {
      monthCol: null,
      statusCol: null,
      amountDueCol: null,
      paidAtCol: null,
      createdAtCol: null,
      clientIdCol: null,
      commissionCol: null,
      fixedFeeCol: null,
    };
  }

  const monthCandidates = ["period_month", "month", "billing_month", "ref_month", "billing_period"] as const;
  const statusCandidates = ["status", "invoice_status"] as const;
  const amountCandidates = ["amount_due_cents", "amount_cents", "total_cents", "due_cents", "value_cents"] as const;
  const paidAtCandidates = ["paid_at", "paidAt", "paid_date"] as const;
  const createdAtCandidates = ["created_at", "createdAt"] as const;
  const clientIdCandidates = ["client_id", "customer_id"] as const;
  const commissionCandidates = ["commission_cents", "commission_amount_cents"] as const;
  const fixedFeeCandidates = ["fixed_fee_cents", "fee_cents", "fixed_cents"] as const;

  const pick = (arr: readonly string[]) => arr.find((c) => hasOwn(sample, c)) ?? null;

  return {
    monthCol: pick(monthCandidates),
    statusCol: pick(statusCandidates),
    amountDueCol: pick(amountCandidates),
    paidAtCol: pick(paidAtCandidates),
    createdAtCol: pick(createdAtCandidates),
    clientIdCol: pick(clientIdCandidates),
    commissionCol: pick(commissionCandidates),
    fixedFeeCol: pick(fixedFeeCandidates),
  };
}

/** RPC mensal (B14) */
async function generateInvoiceForMonth(formData: FormData) {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const client_slug = String(formData.get("client_slug") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim(); // YYYY-MM

  if (!client_slug) throw new Error("Slug do cliente é obrigatório");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido (use YYYY-MM)");

  const period_month = firstDayOfMonthISO(month);

  const { error } = await supabase.rpc("generate_invoice_for_month", {
    p_client_slug: client_slug,
    p_period_month: period_month,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/wavie/faturas");
}

export default async function WavieFaturasPage({
  searchParams,
}: {
  searchParams?: { month?: string; status?: string };
}) {
  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const month = parseMonthParam(searchParams?.month);
  const status = parseStatusParam(searchParams?.status);
  const periodMonthISO = firstDayOfMonthISO(month);

  const schema = await detectInvoicesSchema(supabase);

  // Monta select só com colunas que existem (evita "column does not exist")
  const invoiceSelectCols: string[] = ["id"];
  if (schema.clientIdCol) invoiceSelectCols.push(schema.clientIdCol);
  if (schema.monthCol) invoiceSelectCols.push(schema.monthCol);
  if (schema.statusCol) invoiceSelectCols.push(schema.statusCol);
  if (schema.amountDueCol) invoiceSelectCols.push(schema.amountDueCol);
  if (schema.commissionCol) invoiceSelectCols.push(schema.commissionCol);
  if (schema.fixedFeeCol) invoiceSelectCols.push(schema.fixedFeeCol);
  if (schema.createdAtCol) invoiceSelectCols.push(schema.createdAtCol);
  if (schema.paidAtCol) invoiceSelectCols.push(schema.paidAtCol);

  // join cliente (se existir relacionamento clients)
  // (se não existir, supabase vai ignorar? — melhor manter e se der erro, removemos depois)
  invoiceSelectCols.push("clients:clients(id,name)");

  const selectStr = invoiceSelectCols.join(",");

  let invQ: any = supabase.from("invoices").select(selectStr);

  // filtro por mês (só se existir coluna)
  if (schema.monthCol) invQ = invQ.eq(schema.monthCol, periodMonthISO);

  // filtro por status (só se existir coluna)
  if (status !== "all" && schema.statusCol) invQ = invQ.eq(schema.statusCol, status);

  // order por created_at se existir, senão por id
  if (schema.createdAtCol) invQ = invQ.order(schema.createdAtCol, { ascending: false });
  else invQ = invQ.order("id", { ascending: false });

  const { data: invoicesRaw, error: invErr } = await invQ;
  if (invErr) throw new Error(invErr.message);

  const invoices = (invoicesRaw ?? []) as any[];
  const invoiceIds = invoices.map((i) => i.id).filter(Boolean);

  // pagamentos dessas invoices
  let payments: PaymentRow[] = [];
  if (invoiceIds.length > 0) {
    const { data: pays, error: payErr } = await supabase
      .from("invoice_payments")
      .select("id,invoice_id,amount_cents,method,paid_at,reference,notes")
      .in("invoice_id", invoiceIds)
      .order("paid_at", { ascending: false });

    if (payErr) throw new Error(payErr.message);
    payments = (pays ?? []) as any;
  }

  // agrega pagos
  const paidByInvoice = new Map<string, number>();
  const countByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
    countByInvoice.set(p.invoice_id, (countByInvoice.get(p.invoice_id) ?? 0) + 1);
  }

  const statuses = ["all", "open", "sent", "paid", "void"] as const;

  const getNum = (row: any, col: string | null): number => {
    if (!col) return 0;
    const v = row?.[col];
    return typeof v === "number" ? v : Number(v ?? 0) || 0;
  };

  const getStr = (row: any, col: string | null): string | null => {
    if (!col) return null;
    const v = row?.[col];
    return v == null ? null : String(v);
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "2px solid #000",
          background: "#fff3cd",
          marginBottom: 12,
          fontWeight: 900,
        }}
      >
        ✅ BUILD MARKER: B15.2 / Faturas em produção
      </div>

      {/* Diagnóstico do schema detectado (não quebra prod) */}
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "white",
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <b>Schema detectado (invoices):</b>{" "}
        <span style={{ opacity: 0.85 }}>
          month=<code>{schema.monthCol ?? "—"}</code> • status=<code>{schema.statusCol ?? "—"}</code> • amount=
          <code>{schema.amountDueCol ?? "—"}</code> • paid_at=<code>{schema.paidAtCol ?? "—"}</code> • created_at=
          <code>{schema.createdAtCol ?? "—"}</code>
        </span>
        {!schema.amountDueCol ? (
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            ⚠️ Não achei a coluna do <b>valor</b> da fatura. A lista vai abrir, mas os totais podem aparecer como R$ 0,00
            até detectarmos o nome correto.
          </div>
        ) : null}
        {!schema.monthCol ? (
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            ⚠️ Não achei a coluna do <b>mês</b>. O filtro por mês fica desativado (lista tudo).
          </div>
        ) : null}
      </div>

      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Faturas</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Mês: <b>{month}</b> • Status: <b>{status}</b>
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

      {/* Gerar/Atualizar (B14) */}
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "white",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800 }}>Gerar/atualizar fatura do mês</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Usa a RPC <code>generate_invoice_for_month</code> (cliente por <code>clients.slug</code>).
        </div>

        <div style={{ height: 10 }} />

        <form action={generateInvoiceForMonth} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6, minWidth: 240 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Slug do cliente</span>
            <input
              name="client_slug"
              placeholder="ex: barraca-do-joao"
              style={{
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, minWidth: 220 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Mês</span>
            <input
              name="month"
              defaultValue={month}
              placeholder="YYYY-MM"
              style={{
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "black",
                color: "white",
                cursor: "pointer",
                minWidth: 200,
              }}
            >
              Gerar/Atualizar
            </button>
          </div>
        </form>
      </div>

      <div style={{ height: 14 }} />

      {/* Filtros + CSV */}
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "white",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Lista de faturas</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <form action="/wavie/faturas" method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                name="month"
                defaultValue={month}
                placeholder="YYYY-MM"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  width: 110,
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
                {statuses.map((s) => (
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
                Filtrar
              </button>
            </form>

            <Link
              href={`/api/wavie/invoices/export.csv?month=${encodeURIComponent(month)}&status=${encodeURIComponent(
                status
              )}`}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
                background: "white",
                fontSize: 13,
              }}
            >
              Exportar CSV
            </Link>
          </div>
        </div>

        <div style={{ height: 16 }} />

        {invoices.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.02)",
            }}
          >
            Nenhuma fatura encontrada para este filtro.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {invoices.map((inv) => {
              const invId = String(inv.id);
              const clientId = schema.clientIdCol ? String(inv?.[schema.clientIdCol] ?? "") : "";
              const invStatus = getStr(inv, schema.statusCol) ?? "—";

              const due = getNum(inv, schema.amountDueCol);
              const paid = paidByInvoice.get(invId) ?? 0;
              const cnt = countByInvoice.get(invId) ?? 0;
              const remaining = Math.max(due - paid, 0);

              const paidAt = getStr(inv, schema.paidAtCol);

              return (
                <div
                  key={invId}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 260 }}>
                      <div style={{ fontSize: 14, opacity: 0.75 }}>Cliente</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        {inv.clients?.name ?? clientId ?? "—"}
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(0,0,0,0.12)",
                          }}
                        >
                          status: <b>{invStatus}</b>
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(0,0,0,0.12)",
                          }}
                        >
                          pagamentos: <b>{cnt}</b>
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Total (due)</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(due)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Pago</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(paid)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Restante</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(remaining)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Pago em</div>
                          <div style={{ fontSize: 14 }}>
                            {paidAt ? new Date(paidAt).toLocaleString("pt-BR") : "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <RegisterPaymentModal invoiceId={invId} defaultAmountCents={remaining > 0 ? remaining : due} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Pagamentos</div>
                    {payments.filter((p) => p.invoice_id === invId).length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>Nenhum pagamento registrado.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        {payments
                          .filter((p) => p.invoice_id === invId)
                          .slice(0, 6)
                          .map((p) => (
                            <div
                              key={p.id}
                              style={{
                                padding: "10px 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(0,0,0,0.10)",
                                background: "rgba(0,0,0,0.02)",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13 }}>
                                  <b>{formatBRLFromCents(p.amount_cents)}</b>
                                </span>
                                <span style={{ fontSize: 13, opacity: 0.8 }}>• {p.method}</span>
                                <span style={{ fontSize: 13, opacity: 0.8 }}>
                                  • {new Date(p.paid_at).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, opacity: 0.75 }}>
                                {p.reference ? (
                                  <>
                                    ref: <b>{p.reference}</b>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RegisterPaymentModal({
  invoiceId,
  defaultAmountCents,
}: {
  invoiceId: string;
  defaultAmountCents: number;
}) {
  return (
    <RegisterPaymentModalClient
      invoiceId={invoiceId}
      defaultAmountCents={defaultAmountCents}
      action={createInvoicePayment}
    />
  );
}
