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

    // Espera-se que o worker receba eventos Stripe já normalizados
    const eventType: string | undefined = body?.type;
    const payload = body?.data?.object;

    if (!eventType || !payload) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // --- DESBLOQUEIO AUTOMÁTICO AO PAGAR INVOICE ---
    if (eventType === "invoice.paid") {
      const stripeInvoiceId = payload.id as string | undefined;

      if (!stripeInvoiceId) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      // 1) Resolver invoice interna pelo stripe_invoice_id
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, client_id, status")
        .eq("stripe_invoice_id", stripeInvoiceId)
        .maybeSingle();

      if (invErr || !inv) {
        // invoice não encontrada internamente → ignora (idempotência)
        return NextResponse.json({ ok: true, ignored: true });
      }

      // 2) Desbloquear cliente automaticamente (se aplicável)
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

    // Outros eventos seguem o fluxo já existente
    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
