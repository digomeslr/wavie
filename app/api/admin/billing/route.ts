import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getStripe() {
  // preferimos TEST aqui porque o Wavie ainda está em fase TEST
  const key =
    process.env.STRIPE_SECRET_KEY ??
    process.env.STRIPE_SECRET_KEY_TEST ??
    process.env.STRIPE_SECRET_KEY_LIVE;

  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("client_id");
    if (!clientId) {
      return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, gateway_invoice_id, status, payment_mode, created_at")
      .eq("client_id", clientId)
      .in("status", ["open", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!invoice?.gateway_invoice_id) {
      return NextResponse.redirect("/admin/billing", 302);
    }

    // 1) Se o banco já diz test/live, usa isso.
    if (invoice.payment_mode === "test" || invoice.payment_mode === "live") {
      const stripeUrl =
        invoice.payment_mode === "test"
          ? `https://dashboard.stripe.com/test/invoices/${invoice.gateway_invoice_id}`
          : `https://dashboard.stripe.com/invoices/${invoice.gateway_invoice_id}`;
      return NextResponse.redirect(stripeUrl, 302);
    }

    // 2) Se não diz, pergunta ao Stripe e usa livemode.
    const stripe = getStripe();
    const inv = await stripe.invoices.retrieve(invoice.gateway_invoice_id);
    const stripeUrl = inv.livemode
      ? `https://dashboard.stripe.com/invoices/${invoice.gateway_invoice_id}`
      : `https://dashboard.stripe.com/test/invoices/${invoice.gateway_invoice_id}`;

    return NextResponse.redirect(stripeUrl, 302);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unexpected_error" }, { status: 500 });
  }
}
