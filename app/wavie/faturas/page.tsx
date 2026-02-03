import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createInvoicePayment } from "./actions";

type InvoiceRow = {
  id: string;
  client_id: string | null;
  period_month: string; // ex "2026-01-01" ou "2026-01" dependendo do seu schema
  status: "open" | "sent" | "paid" | "void" | string;
  amount_due_cents: number;
  commission_cents: number | null;
  fixed_fee_cents: number | null;
  created_at: string;
  paid_at: string | null;
  clients?: { id: string; name: string | null } | null;
};

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
  // month: "YYYY-MM" -> "YYYY-MM-01"
  return `${month}-01`;
}

function parseMonthParam(s?: string | null) {
  // aceita YYYY-MM; se vazio -> mês atual
  if (s && /^\d{4}-\d{2}$/.test(s)) return s;
  return monthKey(new Date());
}

function parseStatusParam(s?: string | null) {
  const allowed = new Set(["all", "open", "sent", "paid", "void"]);
  if (s && allowed.has(s)) return s;
  return "all";
}

async function assertWavieAdminOrRedirect(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (!profile || profile.role !== "wavie_admin") redirect("/login");
}

export default async function WavieFaturasPage({
  searchParams,
}: {
  searchParams?: { month?: string; status?: string };
}) {
  const supabase = createClient();
  await assertWavieAdminOrRedirect(supabase);

  const month = parseMonthParam(searchParams?.month);
  const status = parseStatusParam(searchParams?.status);
  const period_month = firstDayOfMonthISO(month);

  // 1) Carrega invoices do mês
  let invQ = supabase
    .from("invoices")
    .select(
      "id,client_id,period_month,status,amount_due_cents,commission_cents,fixed_fee_cents,created_at,paid_at, clients:clients(id,name)"
    )
    .eq("period_month", period_month)
    .order("created_at", { ascending: false });

  if (status !== "all") invQ = invQ.eq("status", status);

  const { data: invoicesRaw, error: invErr } = await invQ;
  if (invErr) throw new Error(invErr.message);

  const invoices: InvoiceRow[] = (invoicesRaw ?? []) as any;
  const invoiceIds = invoices.map((i) => i.id);

  // 2) Carrega pagamentos do mês (apenas das invoices carregadas)
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

  // 3) Agrega pagos por invoice
  const paidByInvoice = new Map<string, number>();
  const countByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
    countByInvoice.set(p.invoice_id, (countByInvoice.get(p.invoice_id) ?? 0) + 1);
  }

  const statuses = ["all", "open", "sent", "paid", "void"] as const;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Faturas</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
            Mês: <b>{month}</b> • Status: <b>{status}</b>
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Filtro mês (inputs simples via querystring) */}
          <form action="/wavie/faturas" method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="status" value={status} />
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

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {statuses.map((s) => (
              <Link
                key={s}
                href={`/wavie/faturas?month=${encodeURIComponent(month)}&status=${encodeURIComponent(s)}`}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  textDecoration: "none",
                  background: s === status ? "black" : "white",
                  color: s === status ? "white" : "black",
                  fontSize: 13,
                }}
              >
                {s}
              </Link>
            ))}
          </div>

          {/* Mantém seu CSV (se já existir endpoint pronto). Ajuste href conforme seu projeto */}
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
            const paid = paidByInvoice.get(inv.id) ?? 0;
            const cnt = countByInvoice.get(inv.id) ?? 0;
            const due = inv.amount_due_cents ?? 0;
            const remaining = Math.max(due - paid, 0);

            return (
              <div
                key={inv.id}
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
                      {inv.clients?.name ?? inv.client_id ?? "—"}
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
                        status: <b>{inv.status}</b>
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
                        <div style={{ fontSize: 14 }}>{inv.paid_at ? new Date(inv.paid_at).toLocaleString("pt-BR") : "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <RegisterPaymentModal
                      invoiceId={inv.id}
                      defaultAmountCents={remaining > 0 ? remaining : due}
                      action={createInvoicePayment}
                    />
                  </div>
                </div>

                {/* Lista compacta de pagamentos (somente os desta invoice) */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Pagamentos</div>
                  {payments.filter((p) => p.invoice_id === inv.id).length === 0 ? (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>Nenhum pagamento registrado.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {payments
                        .filter((p) => p.invoice_id === inv.id)
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
                              {p.reference ? <>ref: <b>{p.reference}</b></> : null}
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
  );
}

/**
 * Client modal (inline) — mantém “página completa” em um arquivo só,
 * sem criar component extra.
 */
function RegisterPaymentModal({
  invoiceId,
  defaultAmountCents,
  action,
}: {
  invoiceId: string;
  defaultAmountCents: number;
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  // @ts-expect-error — Server Action passed to client boundary via prop is supported in Next.js
  return <RegisterPaymentModalClient invoiceId={invoiceId} defaultAmountCents={defaultAmountCents} action={action} />;
}

import RegisterPaymentModalClient from "./register-payment-modal-client";
