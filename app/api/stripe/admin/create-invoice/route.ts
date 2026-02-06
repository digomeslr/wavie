// app/api/stripe/admin/create-invoice/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function assertInternalAuth(req: Request) {
  const header = req.headers.get("x-internal-worker-key");
  const expected = process.env.INTERNAL_WORKER_KEY;
  if (!expected || header !== expected) throw new Error("unauthorized");
}

function getStripeMode() {
  const mode = (process.env.STRIPE_MODE ?? "test") as "test" | "live";
  return mode === "live" ? "live" : "test";
}

function getStripe() {
  const mode = getStripeMode();
  const secretKey =
    mode === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

  if (!secretKey) throw new Error(`Stripe secret key missing for mode=${mode}`);

  return { stripe: new Stripe(secretKey, { apiVersion: "2026-01-28.clover" }), mode };
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

export async function POST(req: Request) {
  try {
    assertInternalAuth(req);

    const body = await req.json().catch(() => ({}));
    const invoiceId = body?.invoice_id as string | undefined;
    if (!invoiceId) {
      return NextResponse.json(
        { ok: false, error: "invoice_id is required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // 1) carrega invoice + client (precisamos do gateway_customer_id)
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id,client_id,month,status,payment_mode,gateway_invoice_id,amount_due_cents")
      .eq("id", invoiceId)
      .maybeSingle<{
        id: string;
        client_id: string;
        month: string;
        status: string | null;
        payment_mode: string | null;
        gateway_invoice_id: string | null;
        amount_due_cents: number | null;
      }>();

    if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
    if (!inv) return NextResponse.json({ ok: false, error: "invoice_not_found" }, { status: 404 });

    if (inv.payment_mode !== "auto") {
      return NextResponse.json({ ok: false, error: "invoice_not_auto" }, { status: 400 });
    }

    // idempotência: já tem gateway_invoice_id
    if (inv.gateway_invoice_id) {
      return NextResponse.json({
        ok: true,
        gateway_invoice_id: inv.gateway_invoice_id,
        created: false,
        reason: "already_linked",
      });
    }

    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id,name,slug,gateway_customer_id")
      .eq("id", inv.client_id)
      .maybeSingle<{
        id: string;
        name: string | null;
        slug: string | null;
        gateway_customer_id: string | null;
      }>();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!client) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

    if (!client.gateway_customer_id || !client.gateway_customer_id.startsWith("cus_")) {
      return NextResponse.json(
        { ok: false, error: "missing_gateway_customer_id" },
        { status: 400 }
      );
    }

    // 2) cria invoice no Stripe
    const { stripe, mode } = getStripe();

    // cria invoice item (valor)
    const amount = inv.amount_due_cents ?? 0;
    if (amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount_due_cents must be > 0" },
        { status: 400 }
      );
    }

    await stripe.invoiceItems.create({
      customer: client.gateway_customer_id,
      amount,
      currency: "brl",
      description: `Wavie mensalidade ${inv.month}`,
      metadata: {
        wavie_invoice_id: inv.id,
        wavie_client_id: client.id,
        env: mode,
      },
    });

    const stripeInvoice = await stripe.invoices.create({
      customer: client.gateway_customer_id,
      collection_method: "charge_automatically",
      auto_advance: true,
      metadata: {
        wavie_invoice_id: inv.id,
        wavie_client_id: client.id,
        env: mode,
      },
    });

    // 3) grava gateway_invoice_id de forma idempotente
    const { error: upErr } = await admin
      .from("invoices")
      .update({ gateway_invoice_id: stripeInvoice.id, updated_at: new Date().toISOString() })
      .eq("id", inv.id)
      .is("gateway_invoice_id", null);

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      created: true,
      gateway_invoice_id: stripeInvoice.id,
      stripe_invoice_status: stripeInvoice.status,
    });
  } catch (err: any) {
    const msg = err?.message ?? "unknown_error";
    const code = msg === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
