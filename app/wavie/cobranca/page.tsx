import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

type AttemptRow = {
  id: string;
  invoice_id: string;
  provider: string;
  method: string;
  status: string;
  amount_cents: number;
  error_message: string | null;
  created_at: string;
};

type SeedResult = { ok: true; created: number; skipped: number } | { ok: false; error: string };

/* ===================== Helpers ===================== */

function formatBRLFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
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

/** ✅ Seed idempotente: cria 1 subscription por client que não tem */
async function seedSubscriptionsAction(): Promise<SeedResult> {
  "use server";

  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  // pega todos os clients
  const { data: clients, error: cErr } = await supabase.from("clients").select("id");
  if (cErr) return { ok: false, error: cErr.message };

  const clientIds: string[] = (clients ?? []).map((c: any) => c.id).filter(Boolean);
  if (clientIds.length === 0) return { ok: true, created: 0, skipped: 0 };

  // pega subscriptions existentes (para evitar conflito/ruído)
  const { data: subs, error: sErr } = await supabase.from("billing_subscriptions").select("client_id");
  if (sErr) return { ok: false, error: sErr.message };

  const existing = new Set<string>((subs ?? []).map((r: any) => r.client_id).filter(Boolean));
  const toCreate = clientIds.filter((id) => !existing.has(id));

  if (toCreate.length === 0) {
    revalidatePath("/wavie/cobranca");
    return { ok: true, created: 0, skipped: clientIds.length };
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
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/wavie/cobranca");
  return { ok: true, created: toCreate.length, skipped: existing.size };
}

/* ===================== Page ===================== */

export default async function WavieCobrancaPage() {
  const supabase = await createClient();
  await assertWavieAdminOrRedirect(supabase);

  // Subscriptions + Client
  const { data: subsRaw, error: subsErr } = await supabase
    .from("billing_subscriptions")
    .select(
      "id,client_id,status,billing_cycle,payment_mode,provider,provider_customer_id,created_at,updated_at,clients:clients(id,name,slug)"
    )
    .order("created_at", { ascending: true });

  if (subsErr) throw new Error(subsErr.message);

  const subscriptions: SubscriptionRow[] = (subsRaw ?? []) as any;

  // Attempts (últimas)
  const { data: attemptsRaw } = await supabase
    .from("invoice_attempts")
    .select("id,invoice_id,provider,method,status,amount_cents,error_message,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const attempts: AttemptRow[] = (attemptsRaw ?? []) as any;

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
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
            <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Assinaturas & Cobrança</h1>
            <p style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
              Gateway-ready • Manual hoje, automático amanhã
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <form action={seedSubscriptionsAction}>
              <button style={btnDark()}>
                Criar assinaturas para clientes existentes
              </button>
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

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Dica: se esta página estiver vazia, clique em{" "}
          <b>“Criar assinaturas…”</b>. Isso é idempotente (não duplica).
        </div>
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
                            • customer: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{s.provider_customer_id}</span>
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
                        <button style={btnDark()}>
                          Trocar para {nextMode.toUpperCase()}
                        </button>
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

      {/* Attempts */}
      <div style={card()}>
        <h2 style={{ marginTop: 0 }}>Tentativas de cobrança (audit trail)</h2>

        {attempts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Nenhuma tentativa registrada.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {attempts.map((a) => (
              <div key={a.id} style={attemptRow(a.status)}>
                <div>
                  <div style={{ fontSize: 13 }}>
                    <b>{a.provider}</b> • {a.method} • {formatBRLFromCents(a.amount_cents)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900 }}>{a.status}</div>
                  {a.error_message && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{a.error_message}</div>
                  )}
                </div>
              </div>
            ))}
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

function attemptRow(status: string) {
  const color =
    status === "succeeded"
      ? "#dcfce7"
      : status === "failed"
      ? "#fee2e2"
      : "#fef3c7";

  return {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: color,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  } as const;
}
