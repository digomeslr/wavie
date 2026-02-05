// app/wavie/cobranca/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import SeedFlashCleaner from "./seed-flash-cleaner";

/* ===================== Types ===================== */

type ClientRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type SubscriptionRow = {
  id: string;
  client_id: string;
  status: "active" | "paused" | "canceled";
  billing_cycle: "monthly" | "yearly";
  payment_mode: "manual" | "auto";
  provider: "stripe" | "pagarme" | "mercadopago" | "asaas" | null;
  provider_customer_id: string | null;
  created_at: string;
  updated_at: string;
  clients?: ClientRow | null;
};

type InvoiceRow = {
  id: string;
  client_id: string;
  month: string;
  status: "open" | "sent" | "paid" | "void";
  locked_at: string | null;
  gross_cents: number;
  wavie_fee_cents: number;
};

type AttemptRow = {
  id: string;
  invoice_id: string;
  status: "queued" | "processing" | "success" | "failed" | "retry_scheduled" | "canceled";
  attempt_no: number;
  provider: string;
  scheduled_for: string | null;
  processed_at: string | null;
  outcome_code: string | null;
  outcome_message: string | null;
  created_at: string;
};

/* ===================== Helpers ===================== */

function formatBRLFromCents(cents: number) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function shortId(id: string) {
  if (!id) return "";
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

/* ===================== Server Actions ===================== */

async function togglePaymentModeAction(formData: FormData) {
  "use server";

  const subscription_id = String(formData.get("subscription_id") ?? "");
  const next_mode = String(formData.get("next_mode") ?? "");

  if (!subscription_id) throw new Error("subscription_id ausente");
  if (!["manual", "auto"].includes(next_mode)) throw new Error("modo inválido");

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const { error } = await supabase
    .from("billing_subscriptions")
    .update({ payment_mode: next_mode })
    .eq("id", subscription_id);

  if (error) {
    console.error("COBRANCA togglePaymentModeAction FAILED:", error);
    throw new Error("TOGGLE_PAYMENT_MODE_FAILED");
  }

  revalidatePath("/wavie/cobranca");
}

async function seedSubscriptionsAction() {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const { data: clients, error: cErr } = await supabase.from("clients").select("id");
  if (cErr) {
    redirect(`/wavie/cobranca?seed=error&msg=${encodeURIComponent(cErr.message)}`);
  }

  const clientIds: string[] = (clients ?? []).map((c: any) => c.id).filter(Boolean);
  if (clientIds.length === 0) {
    redirect(`/wavie/cobranca?seed=ok&c=0&s=0`);
  }

  const { data: subs, error: sErr } = await supabase.from("billing_subscriptions").select("client_id");
  if (sErr) {
    redirect(`/wavie/cobranca?seed=error&msg=${encodeURIComponent(sErr.message)}`);
  }

  const existing = new Set<string>((subs ?? []).map((r: any) => r.client_id).filter(Boolean));
  const toCreate = clientIds.filter((id) => !existing.has(id));

  if (toCreate.length === 0) {
    revalidatePath("/wavie/cobranca");
    redirect(`/wavie/cobranca?seed=ok&c=0&s=${encodeURIComponent(String(clientIds.length))}`);
  }

  const payload = toCreate.map((client_id) => ({
    client_id,
    status: "active",
    billing_cycle: "monthly",
    payment_mode: "manual",
    provider: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    default_payment_method: null,
  }));

  const { error: insErr } = await supabase.from("billing_subscriptions").insert(payload);
  if (insErr) {
    redirect(`/wavie/cobranca?seed=error&msg=${encodeURIComponent(insErr.message)}`);
  }

  revalidatePath("/wavie/cobranca");
  redirect(
    `/wavie/cobranca?seed=ok&c=${encodeURIComponent(String(toCreate.length))}&s=${encodeURIComponent(
      String(existing.size)
    )}`
  );
}

/**
 * 🔥 IMPORTANTE: não dar throw em RPC aqui.
 * Se der erro, voltamos para a própria página com o msg (pra não crashar o app).
 */
async function enqueueAttemptAction(formData: FormData) {
  "use server";

  const invoice_id = String(formData.get("invoice_id") ?? "");
  if (!invoice_id) redirect(`/wavie/cobranca?enq=error&msg=${encodeURIComponent("invoice_id ausente")}`);

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const idem = `sim-${invoice_id}-${Date.now()}`;

  const { data, error } = await supabase.rpc("enqueue_invoice_attempt", {
    p_invoice_id: invoice_id,
    p_idempotency_key: idem,
  });

  if (error) {
    console.error("COBRANCA enqueueAttemptAction FAILED:", error);
    redirect(`/wavie/cobranca?enq=error&msg=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/wavie/cobranca");
  redirect(`/wavie/cobranca?enq=ok&id=${encodeURIComponent(String(data ?? ""))}`);
}

async function processAttemptAction(formData: FormData) {
  "use server";

  const attempt_id = String(formData.get("attempt_id") ?? "");
  if (!attempt_id) redirect(`/wavie/cobranca?proc=error&msg=${encodeURIComponent("attempt_id ausente")}`);

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const { error } = await supabase.rpc("process_invoice_attempt", {
    p_attempt_id: attempt_id,
  });

  if (error) {
    console.error("COBRANCA processAttemptAction FAILED:", error);
    redirect(`/wavie/cobranca?proc=error&msg=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/wavie/cobranca");
  redirect(`/wavie/cobranca?proc=ok`);
}

/* ===================== Page ===================== */

export default async function WavieCobrancaPage({
  searchParams,
}: {
  searchParams?:
    | Promise<{
        seed?: string;
        c?: string;
        s?: string;
        msg?: string;
        enq?: string;
        id?: string;
        proc?: string;
      }>
    | {
        seed?: string;
        c?: string;
        s?: string;
        msg?: string;
        enq?: string;
        id?: string;
        proc?: string;
      };
}) {
  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  const sp =
    searchParams && typeof (searchParams as any).then === "function"
      ? await (searchParams as Promise<any>)
      : (searchParams as any | undefined);

  const seed = String(sp?.seed ?? "");
  const created = Number(sp?.c ?? 0);
  const skipped = Number(sp?.s ?? 0);

  const enq = String(sp?.enq ?? "");
  const enqId = String(sp?.id ?? "");
  const proc = String(sp?.proc ?? "");

  const msg = String(sp?.msg ?? "");

  // Subscriptions + Client
  const { data: subsRaw, error: subsErr } = await supabase
    .from("billing_subscriptions")
    .select(
      "id,client_id,status,billing_cycle,payment_mode,provider,provider_customer_id,created_at,updated_at,clients:clients(id,name,slug)"
    )
    .order("created_at", { ascending: true });

  if (subsErr) throw new Error(subsErr.message);
  const subscriptions: SubscriptionRow[] = (subsRaw ?? []) as any;

  // Invoices (últimas, para enfileirar tentativa)
  const { data: invRaw, error: invErr } = await supabase
    .from("invoices")
    .select("id,client_id,month,status,locked_at,gross_cents,wavie_fee_cents")
    .order("month", { ascending: false })
    .limit(30);

  if (invErr) throw new Error(invErr.message);
  const invoices: InvoiceRow[] = (invRaw ?? []) as any;

  // Attempts (últimas)
  const { data: attemptsRaw, error: attErr } = await supabase
    .from("invoice_attempts")
    .select(
      "id,invoice_id,status,attempt_no,provider,scheduled_for,processed_at,outcome_code,outcome_message,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (attErr) throw new Error(attErr.message);
  const attempts: AttemptRow[] = (attemptsRaw ?? []) as any;

  const processable = attempts.filter((a) => a.status === "queued" || a.status === "retry_scheduled");

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <SeedFlashCleaner />

      {/* Header */}
      <div
        style={{
          padding: 16,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "linear-gradient(90deg,#f0f9ff,#ffffff)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>WAVIE • COBRANÇA</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Assinaturas & Simulador de Cobrança</h1>
            <p style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
              Pipeline auditável • Sem gateway real (simulação ERP-level)
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <form action={seedSubscriptionsAction}>
              <button style={btnDark()}>Criar assinaturas para clientes existentes</button>
            </form>

            <Link href="/wavie/financeiro" style={btn()}>
              Financeiro
            </Link>
            <Link href="/wavie" style={btn()}>
              Voltar
            </Link>
            <Link href="/logout" style={btn()}>
              Sair
            </Link>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {/* Flash banner */}
        {seed === "ok" ? (
          <div style={bannerOk()}>
            ✅ Seed concluído • Criadas: <b>{created}</b> • Já existiam: <b>{skipped}</b>
          </div>
        ) : seed === "error" ? (
          <div style={bannerErr()}>❌ Seed falhou • {msg || "erro desconhecido"}</div>
        ) : enq === "ok" ? (
          <div style={bannerOk()}>
            ✅ Tentativa enfileirada • attempt_id:{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {enqId || "—"}
            </span>
          </div>
        ) : enq === "error" ? (
          <div style={bannerErr()}>❌ Enfileirar falhou • {msg || "erro desconhecido"}</div>
        ) : proc === "ok" ? (
          <div style={bannerOk()}>✅ Tentativa processada</div>
        ) : proc === "error" ? (
          <div style={bannerErr()}>❌ Processar falhou • {msg || "erro desconhecido"}</div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Dica: enfileire uma tentativa em uma fatura <b>aberta</b> e depois processe.
          </div>
        )}
      </div>

      <div style={{ height: 14 }} />

      {/* Subscriptions */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Assinaturas por cliente</h2>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Total: <b>{subscriptions.length}</b>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {subscriptions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
            Nenhuma assinatura encontrada. Clique em <b>“Criar assinaturas…”</b> no topo.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {subscriptions.map((s) => {
              const clientName = s.clients?.name ?? s.clients?.slug ?? s.client_id;
              const nextMode = s.payment_mode === "manual" ? "auto" : "manual";

              return (
                <div key={s.id} style={subCard()}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{clientName}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Status: <b>{s.status}</b> • Ciclo: <b>{s.billing_cycle}</b>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Provider: <b>{s.provider ?? "—"}</b>
                        {s.provider_customer_id ? (
                          <>
                            {" "}
                            • customer:{" "}
                            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                              {s.provider_customer_id}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={pill(s.payment_mode === "auto" ? "#dcfce7" : "#fff7ed")}>
                        {s.payment_mode === "auto" ? "AUTO" : "MANUAL"}
                      </span>

                      <form action={togglePaymentModeAction}>
                        <input type="hidden" name="subscription_id" value={s.id} />
                        <input type="hidden" name="next_mode" value={nextMode} />
                        <button style={btnDark()}>Trocar para {nextMode.toUpperCase()}</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: 14 }} />

      {/* Enqueue attempts */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Enfileirar tentativa (simulador)</h2>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Invoices carregadas: <b>{invoices.length}</b>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "grid", gap: 10 }}>
          {invoices.slice(0, 10).map((inv) => {
            const locked = !!inv.locked_at;
            const disabled = locked || inv.status === "paid" || inv.status === "void";

            return (
              <div key={inv.id} style={row()}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {inv.month} • {inv.status.toUpperCase()} {locked ? "• 🔒 LOCKED" : ""}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    invoice:{" "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {shortId(inv.id)}
                    </span>{" "}
                    • client:{" "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {shortId(inv.client_id)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Bruto: <b>{formatBRLFromCents(inv.gross_cents)}</b> • Devido Wavie:{" "}
                    <b>{formatBRLFromCents(inv.wavie_fee_cents)}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <form action={enqueueAttemptAction}>
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <button style={disabled ? btnDisabled() : btnDark()} disabled={disabled}>
                      Enfileirar tentativa
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Observação: faturas <b>paid/void</b> ou com <b>locked_at</b> não permitem tentativas (governança hard).
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* Attempts */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Tentativas de cobrança (audit trail)</h2>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Processáveis agora: <b>{processable.length}</b>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {attempts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Nenhuma tentativa registrada.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {attempts.map((a) => {
              const canProcess = a.status === "queued" || a.status === "retry_scheduled";

              return (
                <div key={a.id} style={attemptRow(a.status)}>
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <b>{a.status.toUpperCase()}</b> • attempt #{a.attempt_no} • {a.provider}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      attempt:{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {shortId(a.id)}
                      </span>{" "}
                      • invoice:{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {shortId(a.invoice_id)}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Criado: {new Date(a.created_at).toLocaleString("pt-BR")}
                      {a.scheduled_for ? ` • Agendado: ${new Date(a.scheduled_for).toLocaleString("pt-BR")}` : ""}
                      {a.processed_at ? ` • Processado: ${new Date(a.processed_at).toLocaleString("pt-BR")}` : ""}
                    </div>

                    {(a.outcome_code || a.outcome_message) && (
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {a.outcome_code ?? "—"}
                        </span>
                        {a.outcome_message ? ` • ${a.outcome_message}` : ""}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
                    <form action={processAttemptAction}>
                      <input type="hidden" name="attempt_id" value={a.id} />
                      <button style={canProcess ? btnDark() : btnDisabled()} disabled={!canProcess}>
                        Processar
                      </button>
                    </form>
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

/* ===================== UI helpers ===================== */

function btn() {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    textDecoration: "none",
    background: "white",
    fontSize: 13,
    fontWeight: 800,
  } as const;
}

function btnDark() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "black",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
  } as const;
}

function btnDisabled() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    cursor: "not-allowed",
    fontWeight: 900,
  } as const;
}

function card() {
  return {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "white",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  } as const;
}

function subCard() {
  return {
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.02)",
  } as const;
}

function row() {
  return {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.02)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } as const;
}

function pill(bg: string) {
  return {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: bg,
    border: "1px solid rgba(0,0,0,0.12)",
  } as const;
}

function attemptRow(status: AttemptRow["status"]) {
  const bg =
    status === "success"
      ? "#dcfce7"
      : status === "failed"
      ? "#fee2e2"
      : status === "processing"
      ? "#e0f2fe"
      : status === "retry_scheduled"
      ? "#fef3c7"
      : "#ffffff";

  return {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: bg,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } as const;
}

function bannerOk() {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(16,185,129,0.14)",
    fontSize: 13,
    fontWeight: 800,
  } as const;
}

function bannerErr() {
  return {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(239,68,68,0.12)",
    fontSize: 13,
    fontWeight: 800,
  } as const;
}
