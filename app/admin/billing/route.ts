import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
      .select("id, gateway_invoice_id, status, payment_mode")
      .eq("client_id", clientId)
      .in("status", ["open", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (invoice?.gateway_invoice_id) {
      // abre no Stripe Dashboard (test vs live)
      const isTest = invoice.payment_mode === "test";
      const stripeUrl = isTest
        ? `https://dashboard.stripe.com/test/invoices/${invoice.gateway_invoice_id}`
        : `https://dashboard.stripe.com/invoices/${invoice.gateway_invoice_id}`;

      return NextResponse.redirect(stripeUrl, 302);
    }

    // fallback (sem invoice aberta/enviada)
    return NextResponse.redirect("/admin", 302);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "unexpected_error" },
      { status: 500 }
    );
  }
}
