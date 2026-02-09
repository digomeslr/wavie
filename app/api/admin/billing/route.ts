import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");

  if (!clientId) {
    return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, gateway_invoice_id, status")
    .eq("client_id", clientId)
    .in("status", ["open", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (invoice?.gateway_invoice_id) {
    // TEST vs LIVE (usa livemode do invoice no futuro; por enquanto abre dashboard padrão)
    const stripeUrl = `https://dashboard.stripe.com/invoices/${invoice.gateway_invoice_id}`;
    return NextResponse.redirect(stripeUrl, 302);
  }

  return NextResponse.redirect("/admin", 302);
}
