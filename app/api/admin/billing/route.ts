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
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2024-06-20" as any });
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
      .select("id, gateway_invoice_id, status, created_at")
      .eq("client_id", clientId)
      .in("status", ["open", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!invoice?.gateway_invoice_id) {
      return NextResponse.redirect(new URL("/admin/billing", req.url), 302);
    }

    const stripe = getStripe();
    const st = await stripe.invoices.retrieve(invoice.gateway_invoice_id);

    const publicUrl = st.hosted_invoice_url ?? st.invoice_pdf;
    if (!publicUrl) {
      // fallback: se por algum motivo não houver link público, manda pro admin interno
      return NextResponse.redirect(new URL("/admin/billing", req.url), 302);
    }

    return NextResponse.redirect(publicUrl, 302);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unexpected_error" }, { status: 500 });
  }
}
