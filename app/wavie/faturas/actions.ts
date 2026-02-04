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

async function assertWavieAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) throw new Error("Unauthorized");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (profErr) throw new Error(profErr.message);
  if (!profile || profile.role !== "wavie_admin") throw new Error("not allowed");

  return user;
}

/**
 * Registra pagamento manual em invoice_payments.
 * ✅ O trigger do banco é o responsável por atualizar invoices.status e invoices.paid_at
 * (ou seja: removemos qualquer heurística aqui).
 */
export async function createInvoicePayment(formData: FormData) {
  const supabase = await createClient();

  let userId: string;
  try {
    const user = await assertWavieAdmin(supabase);
    userId = user.id;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Unauthorized" };
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

  const paidAtIso = paid_at ? new Date(paid_at).toISOString() : new Date().toISOString();

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id,
    amount_cents,
    method,
    paid_at: paidAtIso,
    reference,
    notes,
    created_by: userId,
  });

  if (error) return { ok: false, error: error.message };

  // ✅ Nada de recomputar invoice aqui — o TRIGGER já faz isso no banco.
  revalidatePath("/wavie/faturas");
  return { ok: true };
}
