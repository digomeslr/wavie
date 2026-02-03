"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function toCentsBRL(input: string): number {
  // aceita "123", "123,45", "123.45", "1.234,56"
  const s = (input ?? "").trim();
  if (!s) throw new Error("Valor inválido.");

  // remove espaços e simbolos comuns
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "") // remove separador de milhar
    .replace(",", "."); // decimal pt-BR -> dot

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) throw new Error("Valor inválido.");

  // cents com arredondamento seguro
  return Math.round(num * 100);
}

export async function createInvoicePayment(formData: FormData) {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false, error: "Unauthorized" };
  }

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

  // paid_at opcional (se vier vazio, banco usa now() default)
  const paidAtIso = paid_at ? new Date(paid_at).toISOString() : null;

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id,
    amount_cents,
    method,
    paid_at: paidAtIso ?? undefined,
    reference,
    notes,
    created_by: user.id,
  });

  if (error) {
    // RLS/role errado cai aqui também
    return { ok: false, error: error.message };
  }

  revalidatePath("/wavie/faturas");
  return { ok: true };
}
