// app/api/stripe/admin/finalize-invoice/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  try {
    assertInternalAuth(req);

    const body = await req.json().catch(() => ({}));
    const gatewayInvoiceId = body?.gateway_invoice_id as string | undefined;

    if (!gatewayInvoiceId || !gatewayInvoiceId.startsWith("in_")) {
      return NextResponse.json(
        { ok: false, error: "gateway_invoice_id (in_...) is required" },
        { status: 400 }
      );
    }

    const { stripe, mode } = getStripe();

    // 1) lê status atual
    const current = await stripe.invoices.retrieve(gatewayInvoiceId);

    // 2) se já não é draft, só retorna (idempotente)
    if (current.status !== "draft") {
      return NextResponse.json({
        ok: true,
        mode,
        gateway_invoice_id: gatewayInvoiceId,
        created: false,
        status: current.status,
        message: "already_finalized_or_not_draft",
      });
    }

    // 3) finaliza
    const finalized = await stripe.invoices.finalizeInvoice(gatewayInvoiceId);

    return NextResponse.json({
      ok: true,
      mode,
      gateway_invoice_id: gatewayInvoiceId,
      status: finalized.status,
      hosted_invoice_url: finalized.hosted_invoice_url,
      invoice_pdf: finalized.invoice_pdf,
    });
  } catch (err: any) {
    const msg = err?.message ?? "unknown_error";
    const code = msg === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
