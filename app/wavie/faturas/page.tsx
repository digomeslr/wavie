import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createInvoicePayment } from "./actions";
import RegisterPaymentModalClient from "./register-payment-modal-client";

type ClientMini = { id: string; name: string | null; slug: string | null };

type InvoiceRow = {
  id: string;
  client_id: string | null;
  month: string; // date (YYYY-MM-DD)
  status: "open" | "sent" | "paid" | "void" | string;
  gross_cents: number | null;
  wavie_fee_cents: number | null;
  created_at: string;
  paid_at: string | null;
  locked_at: string | null;
  clients?: { id: string; name: string | null; slug: string | null } | null;
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

type OverrideRow = {
  id: string;
  invoice_id: string;
  action: string;
  reason: string;
  meta: any;
  created_by: string;
  created_at: string;
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

/** RPC mensal (gera/atualiza) — assinatura real: (p_client_id, p_month) */
async function generateInvoiceForMonth(formData: FormData) {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const client_id = String(formData.get("client_id") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim(); // YYYY-MM

  if (!client_id) throw new Error("Cliente é obrigatório");
  if (!/^\w[\w-]*$/.test(client_id)) throw new Error("client_id inválido");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido (use YYYY-MM)");

  const month_date = firstDayOfMonthISO(month); // YYYY-MM-01

  const { error } = await supabase.rpc("generate_invoice_for_month", {
    p_client_id: client_id,
    p_month: month_date,
  });

  if (error) {
    console.error("WAVIE/FATURAS RPC generate_invoice_for_month FAILED:", error);
    throw new Error("RPC_GENERATE_INVOICE_FOR_MONTH_FAILED");
  }

  revalidatePath("/wavie/faturas");
}

/** ✅ Override: desbloquear invoice (RPC unlock_invoice) */
async function unlockInvoiceAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const invoice_id = String(formData.get("invoice_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!invoice_id) throw new Error("invoice_id ausente");
  if (!reason || reason.length < 5) throw new Error("Motivo obrigatório (mín. 5 caracteres)");

  const { error } = await supabase.rpc("unlock_invoice", {
    p_invoice_id: invoice_id,
    p_reason: reason,
  });

  if (error) {
    console.error("WAVIE/FATURAS RPC unlock_invoice FAILED:", error);
    throw new Error("RPC_UNLOCK_INVOICE_FAILED");
  }

  revalidatePath("/wavie/faturas");
}

export default async function WavieFaturasPage({
  searchParams,
}: {
  searchParams?: { month?: string; status?: string };
}) {
  const supabase = await createClient();

  try {
    await assertWavieAdminOrRedirect(supabase);

    const month = parseMonthParam(searchParams?.month);
    const status = parseStatusParam(searchParams?.status);
    const month_date = firstDayOfMonthISO(month);

    // clientes para SELECT
    const { data: clientsRaw, error: clientsErr } = await supabase
      .from("clients")
      .select("id,name,slug")
      .order("name", { ascending: true });

    if (clientsErr) {
      console.error("WAVIE/FATURAS clients query FAILED:", clientsErr);
      throw new Error("CLIENTS_QUERY_FAILED");
    }

    const clients: ClientMini[] = ((clientsRaw ?? []) as any).filter((c: any) => c?.id);

    // invoices do mês
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
          "created_at",
          "paid_at",
          "locked_at",
          "clients:clients(id,name,slug)",
        ].join(",")
      )
      .eq("month", month_date)
      .order("created_at", { ascending: false });

    if (status !== "all") invQ = invQ.eq("status", status);

    const { data: invoicesRaw, error: invErr } = await invQ;
    if (invErr) {
      console.error("WAVIE/FATURAS invoices query FAILED:", invErr);
      throw new Error("INVOICES_QUERY_FAILED");
    }

    const invoices: InvoiceRow[] = (invoicesRaw ?? []) as any;
    const invoiceIds = invoices.map((i) => i.id);

    // lock status do mês (qualquer invoice locked => mês “travado” para ações)
    const lockedCount = invoices.filter((i) => i.locked_at).length;
    const isLockedAny = lockedCount > 0;
    const isFullyLocked = invoices.length > 0 && lockedCount === invoices.length;
    const isPartiallyLocked = lockedCount > 0 && lockedCount < invoices.length;

    // pagamentos
    let payments: PaymentRow[] = [];
    if (invoiceIds.length > 0) {
      const { data: pays, error: payErr } = await supabase
        .from("invoice_payments")
        .select("id,invoice_id,amount_cents,method,paid_at,reference,notes")
        .in("invoice_id", invoiceIds)
        .order("paid_at", { ascending: false });

      if (payErr) {
        console.error("WAVIE/FATURAS invoice_payments query FAILED:", payErr);
        throw new Error("PAYMENTS_QUERY_FAILED");
      }
      payments = (pays ?? []) as any;
    }

    // overrides (últimos 300 no mês, depois agregamos por invoice)
    let overrides: OverrideRow[] = [];
    if (invoiceIds.length > 0) {
      const { data: ovs, error: ovErr } = await supabase
        .from("invoice_overrides")
        .select("id,invoice_id,action,reason,meta,created_by,created_at")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false })
        .limit(300);

      if (ovErr) {
        console.error("WAVIE/FATURAS invoice_overrides query FAILED:", ovErr);
        // não quebra a página inteira — só não mostra overrides
        overrides = [];
      } else {
        overrides = (ovs ?? []) as any;
      }
    }

    // agrega payments
    const paidByInvoice = new Map<string, number>();
    const countByInvoice = new Map<string, number>();
    for (const p of payments) {
      paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + (p.amount_cents ?? 0));
      countByInvoice.set(p.invoice_id, (countByInvoice.get(p.invoice_id) ?? 0) + 1);
    }

    // agrega overrides
    const overridesByInvoice = new Map<string, OverrideRow[]>();
    for (const o of overrides) {
      const arr = overridesByInvoice.get(o.invoice_id) ?? [];
      arr.push(o);
      overridesByInvoice.set(o.invoice_id, arr);
    }

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
          ✅ BUILD MARKER: D2 / Override UI (unlock_invoice + log)
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Faturas</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
              Mês: <b>{month}</b> • Status: <b>{status}</b>
            </p>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 12 }}>
              Bruto = vendas do cliente • Devido = taxa Wavie • Pago = recebido • Restante = saldo em aberto
            </p>

            {isLockedAny ? (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isFullyLocked ? (
                  <span style={pill("rgba(239,68,68,0.16)", "#7f1d1d")}>🔒 MÊS FECHADO</span>
                ) : isPartiallyLocked ? (
                  <span style={pill("rgba(245,158,11,0.18)", "#7c2d12")}>🔒 PARCIALMENTE FECHADO</span>
                ) : null}
                <span style={pill("rgba(0,0,0,0.06)", "rgba(0,0,0,0.75)")}>
                  locked: <b>{lockedCount}</b> / <b>{invoices.length}</b>
                </span>
              </div>
            ) : null}
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

        <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Gerar/atualizar fatura do mês</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                RPC <code>generate_invoice_for_month(p_client_id, p_month)</code>.
              </div>
              {isLockedAny ? (
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Este mês está <b>travado</b>. Para ajustar, use <b>override</b> por fatura (desbloquear com motivo).
                </div>
              ) : null}
            </div>

            {isLockedAny ? (
              <span style={pill("rgba(239,68,68,0.12)", "#7f1d1d")}>🔒 Ações desabilitadas no mês fechado</span>
            ) : null}
          </div>

          <div style={{ height: 10 }} />

          <form action={generateInvoiceForMonth} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6, minWidth: 320 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Cliente</span>
              <select
                name="client_id"
                defaultValue=""
                required
                disabled={isLockedAny}
                style={{
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: isLockedAny ? "rgba(0,0,0,0.06)" : "white",
                  cursor: isLockedAny ? "not-allowed" : "pointer",
                }}
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.slug ?? c.id}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, minWidth: 240 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Mês</span>
              <input
                name="month"
                type="month"
                defaultValue={month}
                disabled={isLockedAny}
                style={{
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: isLockedAny ? "rgba(0,0,0,0.06)" : "white",
                  cursor: isLockedAny ? "not-allowed" : "text",
                }}
              />
            </label>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                disabled={isLockedAny}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: isLockedAny ? "rgba(0,0,0,0.15)" : "black",
                  color: "white",
                  cursor: isLockedAny ? "not-allowed" : "pointer",
                  minWidth: 200,
                  fontWeight: 900,
                }}
              >
                {isLockedAny ? "Mês fechado" : "Gerar/Atualizar"}
              </button>
            </div>
          </form>
        </div>

        <div style={{ height: 14 }} />

        <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
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

                const due = Number(inv.wavie_fee_cents ?? 0);
                const gross = Number(inv.gross_cents ?? 0);
                const remaining = Math.max(due - paid, 0);
                const isPaid = inv.status === "paid" || (due > 0 && remaining === 0) || due === 0;

                const isLocked = Boolean(inv.locked_at);
                const invOverrides = (overridesByInvoice.get(inv.id) ?? []).slice(0, 5);

                return (
                  <div
                    key={inv.id}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: isLocked ? "rgba(239,68,68,0.06)" : "white",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontSize: 14, opacity: 0.75 }}>Cliente</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>
                          {inv.clients?.name ?? inv.clients?.slug ?? inv.client_id ?? "—"}
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 12,
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(0,0,0,0.12)",
                              background: "white",
                            }}
                          >
                            status: <b>{isPaid ? "paid" : inv.status}</b>
                          </span>

                          <span
                            style={{
                              fontSize: 12,
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(0,0,0,0.12)",
                              background: "white",
                            }}
                          >
                            pagamentos: <b>{cnt}</b>
                          </span>

                          {isLocked ? <span style={pill("rgba(239,68,68,0.16)", "#7f1d1d")}>🔒 FATURA BLOQUEADA</span> : null}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: 280 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Bruto do cliente</div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{formatBRLFromCents(gross)}</div>
                          </div>

                          <div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Devido à Wavie</div>
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

                          {isLocked ? (
                            <div>
                              <div style={{ fontSize: 12, opacity: 0.75 }}>Bloqueado em</div>
                              <div style={{ fontSize: 14 }}>{new Date(inv.locked_at as string).toLocaleString("pt-BR")}</div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {isLocked ? (
                          <>
                            <UnlockButton invoiceId={inv.id} action={unlockInvoiceAction} />
                            <button
                              disabled
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(0,0,0,0.15)",
                                background: "rgba(0,0,0,0.10)",
                                color: "rgba(0,0,0,0.65)",
                                cursor: "not-allowed",
                                fontWeight: 900,
                                minWidth: 200,
                              }}
                              title="Mês fechado: pagamentos bloqueados pelo banco"
                            >
                              🔒 Pagamento bloqueado
                            </button>
                          </>
                        ) : (
                          <RegisterPaymentModal invoiceId={inv.id} defaultAmountCents={remaining > 0 ? remaining : due} />
                        )}
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
                            .slice(0, 8)
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
                                  <span style={{ fontSize: 13, opacity: 0.8 }}>• {new Date(p.paid_at).toLocaleString("pt-BR")}</span>
                                </div>
                                <div style={{ fontSize: 13, opacity: 0.75 }}>
                                  {p.reference ? (
                                    <>
                                      ref: <b>{p.reference}</b>
                                    </>
                                  ) : null}
                                  {p.notes ? (
                                    <>
                                      {p.reference ? " • " : ""}
                                      {p.notes}
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Overrides (auditável)</div>
                      {invOverrides.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.7 }}>Nenhum override nesta fatura.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {invOverrides.map((o) => (
                            <div
                              key={o.id}
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
                                  <b>{o.action}</b>
                                </span>
                                <span style={{ fontSize: 13, opacity: 0.8 }}>• {new Date(o.created_at).toLocaleString("pt-BR")}</span>
                              </div>
                              <div style={{ fontSize: 13, opacity: 0.75 }}>{o.reason}</div>
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
  } catch (e: any) {
    console.error("WAVIE/FATURAS SSR FATAL:", e);
    throw e;
  }
}

function RegisterPaymentModal({
  invoiceId,
  defaultAmountCents,
}: {
  invoiceId: string;
  defaultAmountCents: number;
}) {
  return <RegisterPaymentModalClient invoiceId={invoiceId} defaultAmountCents={defaultAmountCents} action={createInvoicePayment} />;
}

/**
 * Botão client-side simples para pedir motivo e submeter server action
 * (sem depender de libs/modais).
 */
function UnlockButton({
  invoiceId,
  action,
}: {
  invoiceId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        // o "prompt" é só no client; o form ainda executa server action
        const reason = window.prompt("Motivo para desbloquear esta fatura (obrigatório):");
        if (!reason || reason.trim().length < 5) {
          e.preventDefault();
          alert("Motivo obrigatório (mínimo 5 caracteres).");
          return;
        }
        // injeta motivo num input hidden
        const form = e.currentTarget as HTMLFormElement;
        const input = form.querySelector('input[name="reason"]') as HTMLInputElement | null;
        if (input) input.value = reason.trim();
      }}
    >
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="reason" value="" />
      <button
        type="submit"
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
          minWidth: 200,
        }}
        title="Override auditável: exige motivo e registra log"
      >
        🔓 Desbloquear (override)
      </button>
    </form>
  );
}
