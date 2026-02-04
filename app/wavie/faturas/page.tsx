import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createInvoicePayment } from "./actions";
import RegisterPaymentModalClient from "./register-payment-modal-client";

type InvoiceRow = {
  id: string;
  client_id: string | null;
  month: string; // date (YYYY-MM-DD)
  status: "open" | "sent" | "paid" | "void" | string;
  orders_count: number | null;
  gross_cents: number | null;
  wavie_fee_cents: number | null;
  created_at: string;
  paid_at: string | null;
  clients?: { id: string; name: string | null; slug?: string | null } | null;
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
  const v = (Number(cents ?? 0) || 0) / 100;
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

/** RPC mensal (gera/atualiza) */
async function generateInvoiceForMonth(formData: FormData) {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const client_slug = String(formData.get("client_slug") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim(); // YYYY-MM

  if (!client_slug) throw new Error("Cliente é obrigatório");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido (use YYYY-MM)");

  const month_date = firstDayOfMonthISO(month);

  const { error } = await supabase.rpc("generate_invoice_for_month", {
    p_client_slug: client_slug,
    p_period_month: month_date,
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
  const month_date = firstDayOfMonthISO(month);

  // Clientes p/ select (slug)
  const { data: clientsRaw, error: clientsErr } = await supabase
    .from("clients")
    .select("id,name,slug")
    .order("name", { ascending: true });

  if (clientsErr) throw new Error(clientsErr.message);
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string | null; slug: string | null }>;

  // invoices do mês (coluna certa: month)
  let invQ = supabase
    .from("invoices")
    .select(
      [
        "id",
        "client_id",
        "month",
        "status",
        "orders_count",
        "gross_cents",
        "wavie_fee_cents",
        "created_at",
        "paid_at",
        "clients:clients(id,name,slug)",
      ].join(",")
    )
    .eq("month", month_date)
    .order("created_at", { ascending: false });

  if (status !== "all") invQ = invQ.eq("status", status);

  const { data: invoicesRaw, error: invErr } = await invQ;
  if (invErr) throw new Error(invErr.message);

  const invoices: InvoiceRow[] = (invoicesRaw ?? []) as any;
  const invoiceIds = invoices.map((i) => i.id);

  // pagamentos das invoices
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

  // agrega pagamentos
  const paidByInvoice = new Map<string, number>();
  const countByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
    countByInvoice.set(p.invoice_id, (countByInvoice.get(p.invoice_id) ?? 0) + 1);
  }

  const statuses = ["all", "open", "sent", "paid", "void"] as const;

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

      {/* Gerar/Atualizar */}
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
          <label style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Cliente</span>
            <select
              name="client_slug"
              defaultValue=""
              style={{
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "white",
              }}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.slug ?? ""} disabled={!c.slug}>
                  {(c.name ?? c.slug ?? c.id) + (c.slug ? "" : " (sem slug)")}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, minWidth: 220 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Mês</span>
            <input
              name="month"
              type="month"
              defaultValue={month}
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
              const paid = paidByInvoice.get(inv.id) ?? 0;
              const cnt = countByInvoice.get(inv.id) ?? 0;

              const gross = Number(inv.gross_cents ?? 0) || 0;
              const fee = Number(inv.wavie_fee_cents ?? 0) || 0;

              // “due” = gross_cents (você pode trocar para fee se quiser cobrar só a taxa)
              const due = gross;
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
                          pedidos: <b>{inv.orders_count ?? 0}</b>
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
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Bruto</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(gross)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Taxa Wavie</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(fee)}</div>
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
                            {inv.paid_at ? new Date(inv.paid_at).toLocaleString("pt-BR") : "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <RegisterPaymentModal invoiceId={inv.id} defaultAmountCents={remaining > 0 ? remaining : due} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Pagamentos</div>
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
    <RegisterPaymentModalClient invoiceId={invoiceId} defaultAmountCents={defaultAmountCents} action={createInvoicePayment} />
  );
}
