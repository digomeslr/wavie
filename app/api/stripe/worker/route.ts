// app/api/stripe/worker/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function assertInternalAuth(req: Request) {
  const header = req.headers.get("x-internal-worker-key");
  const expected = process.env.INTERNAL_WORKER_KEY;
  if (!expected || header !== expected) throw new Error("unauthorized");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is required");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractStripeEvent(payload: any) {
  return payload?.event ?? payload;
}

export async function POST(req: Request) {
  try {
    assertInternalAuth(req);
    const admin = getSupabaseAdmin();

    // 1) claim 1 evento
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_next_stripe_event"
    );
    if (claimErr) {
      return NextResponse.json(
        { ok: false, error: claimErr.message },
        { status: 500 }
      );
    }

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ ok: true, processed: false });
    }

    const evt = claimed[0];

    try {
      // 2) buscar payload do webhook
      const { data: wh, error: whErr } = await admin
        .from("stripe_webhook_events")
        .select("payload")
        .eq("stripe_event_id", evt.stripe_event_id)
        .maybeSingle();

      if (whErr) throw new Error(whErr.message);
      if (!wh?.payload) throw new Error("missing_webhook_payload");

      const stripeEvent = extractStripeEvent(wh.payload);
      const eventType: string | null = stripeEvent?.type ?? null;
      if (!eventType) throw new Error("missing_event_type");

      // 3) regra de ação por tipo (process/ignore)
      const { data: rule, error: ruleErr } = await admin
        .from("stripe_event_type_rules")
        .select("action")
        .eq("event_type", eventType)
        .maybeSingle<{ action: "process" | "ignore" }>();

      if (ruleErr) throw new Error(ruleErr.message);

      if (rule?.action === "ignore") {
        // marca como ignored e finaliza
        const { error: igErr } = await admin
          .from("stripe_event_process_queue")
          .update({ status: "ignored", processed_at: new Date().toISOString() })
          .eq("id", evt.id);

        if (igErr) throw new Error(igErr.message);

        return NextResponse.json({
          ok: true,
          processed: true,
          ignored: true,
          stripe_event_id: evt.stripe_event_id,
          event_type: eventType,
        });
      }

      // 4) processar eventos financeiros (por enquanto: invoice paid)
      const isInvoicePaid =
        eventType === "invoice.paid" || eventType === "invoice.payment_succeeded";

      if (isInvoicePaid) {
        const invoice = stripeEvent.data.object;
        const gatewayInvoiceId: string = invoice.id;

        const paidAt =
          invoice.status_transitions?.paid_at != null
            ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
            : null;

        const { error: applyErr } = await admin.rpc("apply_invoice_paid", {
          p_gateway_invoice_id: gatewayInvoiceId,
          p_paid_at: paidAt,
        });

        if (applyErr) throw new Error(applyErr.message);
      }

      // 5) finaliza como processed
      const { error: doneErr } = await admin.rpc(
        "mark_stripe_event_processed",
        { p_id: evt.id }
      );
      if (doneErr) throw new Error(doneErr.message);

      return NextResponse.json({
        ok: true,
        processed: true,
        stripe_event_id: evt.stripe_event_id,
        event_type: eventType,
      });
    } catch (processErr: any) {
      await admin.rpc("mark_stripe_event_failed", {
        p_id: evt.id,
        p_error: processErr?.message ?? "processing_error",
      });

      return NextResponse.json(
        { ok: false, error: processErr?.message ?? "processing_error" },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "unauthorized" },
      { status: 401 }
    );
  }
}
