"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function toCentsBRL(input: string): number {
  const s = (input ?? "").trim();
  if (!s) throw new Error("Valor inválido.");

  const cleaned = s
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) throw new Error("Valor inválido.");

  return Math.round(num * 100);
}

export async function createInvoicePayment(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return { ok: false, error: "Unauthorized" };

  const invoice_id = String(formData.get("invoice_id") ?? "");
  const method = String(formData.get("method") ?? "pix");
  const amountStr = String(formData.get("amount") ?? "");
  const paid_at = String(formData.get("paid_at") ?? "");
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!invoice_id) return { ok: false, error: "invoice_id ausente" };

  let amount_cents = 0;
  try {
    amount_cents = toCentsBRL(amountStr);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Valor inválido" };
  }

  const paidAtIso = paid_at ? new Date(paid_at).toISOString() : new Date().toISOString();

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id,
    amount_cents,
    method,
    paid_at: paidAtIso,
    reference,
    notes,
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  // ✅ Recalcula status/paid_at da invoice no server (sem depender de trigger quebrado)
  // due = gross_cents - wavie_fee_cents
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,gross_cents,wavie_fee_cents,paid_at,status")
    .eq("id", invoice_id)
    .maybeSingle<{
      id: string;
      gross_cents: number | null;
      wavie_fee_cents: number | null;
      paid_at: string | null;
      status: string | null;
    }>();

  if (!invErr && inv) {
    const gross = Number(inv.gross_cents ?? 0);
    const fee = Number(inv.wavie_fee_cents ?? 0);
    const due = Math.max(gross - fee, 0);

    const { data: sums, error: sumErr } = await supabase
      .from("invoice_payments")
      .select("amount_cents")
      .eq("invoice_id", invoice_id);

    if (!sumErr) {
      const paid = (sums ?? []).reduce((acc, r: any) => acc + Number(r.amount_cents ?? 0), 0);

      const fullyPaid = due > 0 ? paid >= due : paid > 0; // se due=0, qualquer pagamento marca como paid
      const nextStatus = fullyPaid ? "paid" : inv.status ?? "open";
      const nextPaidAt = fullyPaid ? inv.paid_at ?? new Date().toISOString() : null;

      await supabase
        .from("invoices")
        .update({ status: nextStatus, paid_at: nextPaidAt })
        .eq("id", invoice_id);
    }
  }

  revalidatePath("/wavie/faturas");
  return { ok: true };
}
