import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function assertCronAuth(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new Error("CRON_SECRET is not set");

  const provided =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice("Bearer ".length)
      : null);

  return Boolean(provided && provided === expected);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  // ✅ Removido apiVersion hardcoded para evitar mismatch de types
  return new Stripe(key);
}

type DequeuedRetry = {
  attempt_id: string;
  invoice_id: string;
  client_id: string;
  retry_policy_id: string | null;
  attempt_status: "queued" | "processing" | "success" | "failed" | "retry_scheduled" | "canceled";
  retry_scheduled_at: string | null;
  retry_reason: string | null;
};

async function updateAttemptStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  attemptId: string,
  status: "success" | "failed" | "canceled"
) {
  const { error } = await supabase
    .from("invoice_attempts")
    .update({ status })
    .eq("id", attemptId);

  if (error) throw error;
}

async function fetchInvoiceStripeId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  invoiceId: string
): Promise<{ stripe_invoice_id: string; status?: string | null; client_id?: string | null }> {
  // Assumimos que existe stripe_invoice_id na tabela invoices.
  // Se o nome for diferente, me mande o campo correto e eu ajusto no próximo passo.
  const { data, error } = await supabase
    .from("invoices")
    .select("id, client_id, status, stripe_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("invoice_not_found");
  if (!data.stripe_invoice_id) throw new Error("stripe_invoice_id_missing_on_invoice");

  return {
    stripe_invoice_id: data.stripe_invoice_id as string,
    status: (data.status as string | null) ?? null,
    client_id: (data.client_id as string | null) ?? null,
  };
}

export async function POST(req: Request) {
  try {
    if (!assertCronAuth(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const stripe = getStripe();

    const limit = 10;

    // 1) Dequeue (marca attempts como processing no banco)
    const { data: items, error: dqErr } = await supabase.rpc("dequeue_due_invoice_retries", {
      p_limit: limit,
    });
    if (dqErr) throw dqErr;

    const list = (items ?? []) as DequeuedRetry[];

    if (list.length === 0) {
      return NextResponse.json({ ok: true, worker: "invoice-retry", dequeued: 0, results: [] });
    }

    // 2) Processar serialmente (mais seguro para início)
    const results: any[] = [];

    for (const job of list) {
      const attemptId = job.attempt_id;
      const invoiceId = job.invoice_id;
      const clientId = job.client_id;

      try {
        // 2.1) Buscar stripe_invoice_id
        const inv = await fetchInvoiceStripeId(supabase, invoiceId);

        // Guard-rail: se invoice já está paga no nosso banco, não tenta cobrar
        if (inv.status && ["paid", "settled"].includes(inv.status)) {
          await updateAttemptStatus(supabase, attemptId, "canceled");
          results.push({
            attempt_id: attemptId,
            invoice_id: invoiceId,
            outcome: "canceled",
            reason: "invoice_already_paid",
          });
          continue;
        }

        // 2.2) Tentar pagar no Stripe
        await stripe.invoices.pay(inv.stripe_invoice_id);

        // 2.3) Marca tentativa como success
        // A atualização final de invoice (paid/open/etc) continua via webhook (governança)
        await updateAttemptStatus(supabase, attemptId, "success");

        results.push({
          attempt_id: attemptId,
          invoice_id: invoiceId,
          outcome: "success",
        });
      } catch (err: any) {
        // 2.4) Marca tentativa como failed
        try {
          await updateAttemptStatus(supabase, attemptId, "failed");
        } catch {
          // evita crash em cascata
        }

        // 2.5) Reagendar próximo retry via RPC idempotente
        let reschedule: any = null;
        try {
          const { data: sch, error: schErr } = await supabase.rpc("schedule_invoice_retry_if_allowed", {
            p_invoice_id: invoiceId,
            p_client_id: clientId,
            p_plan_id: null,
            p_reason: "auto_retry_failed_attempt",
          });
          if (schErr) throw schErr;
          reschedule = Array.isArray(sch) ? sch[0] : sch;
        } catch (e: any) {
          reschedule = { scheduled: false, message: e?.message ?? String(e) };
        }

        results.push({
          attempt_id: attemptId,
          invoice_id: invoiceId,
          outcome: "failed",
          error: err?.message ?? String(err),
          reschedule,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      worker: "invoice-retry",
      dequeued: list.length,
      processed: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, worker: "invoice-retry", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
