import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const eventType: string | undefined = body?.type;
    const payload = body?.data?.object;

    if (!eventType || !payload) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 🔓 DESBLOQUEIO AUTOMÁTICO QUANDO INVOICE É PAGA
    if (eventType === "invoice.paid") {
      const gatewayInvoiceId = payload.id as string | undefined;

      if (!gatewayInvoiceId) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      // 1) Resolver invoice interna pelo gateway_invoice_id
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, client_id, status")
        .eq("gateway_invoice_id", gatewayInvoiceId)
        .maybeSingle();

      if (invErr || !inv) {
        // idempotência: invoice ainda não existe internamente
        return NextResponse.json({ ok: true, ignored: true });
      }

      // 2) Desbloqueio automático (restricted → active)
      await supabase.rpc("unlock_client_if_invoice_paid", {
        p_client_id: inv.client_id,
        p_invoice_id: inv.id,
        p_reason: "stripe_invoice_paid_auto",
      });

      return NextResponse.json({
        ok: true,
        action: "client_auto_unlocked_if_applicable",
        invoice_id: inv.id,
        client_id: inv.client_id,
      });
    }

    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
