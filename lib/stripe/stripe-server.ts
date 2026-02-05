// src/lib/stripe/stripe-server.ts
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY_TEST;
  if (!key) throw new Error("STRIPE_SECRET_KEY_TEST missing");
  return new Stripe(key, { apiVersion: "2024-06-20" as any });
}

async function assertWavieAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) throw new Error("NOT_AUTHENTICATED");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (profErr || !profile || profile.role !== "wavie_admin") throw new Error("NOT_WAVIE_ADMIN");

  return { supabase, userId: user.id };
}

/**
 * Cria (ou reaproveita) um customer Stripe (modo TEST) para um client_id do Wavie.
 * - Não cobra nada.
 * - Apenas cria a entidade "Customer" no Stripe e salva stripe_customer_id no banco.
 */
export async function ensureStripeCustomerForClient(clientId: string) {
  const mode = process.env.STRIPE_MODE || "test";
  if (mode !== "test") throw new Error("For now, only STRIPE_MODE=test is supported");

  const { supabase, userId } = await assertWavieAdmin();

  // 1) se já existe no banco, retorna
  const { data: existing, error: exErr } = await supabase
    .from("stripe_customers")
    .select("id,client_id,stripe_customer_id,stripe_mode")
    .eq("client_id", clientId)
    .eq("stripe_mode", "test")
    .maybeSingle<{ id: string; client_id: string; stripe_customer_id: string; stripe_mode: "test" | "live" }>();

  if (exErr) throw new Error(exErr.message);
  if (existing?.stripe_customer_id) {
    return { stripe_customer_id: existing.stripe_customer_id, reused: true };
  }

  // 2) buscar dados do client (nome/slug)
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id,name,slug")
    .eq("id", clientId)
    .maybeSingle<{ id: string; name: string | null; slug: string | null }>();

  if (cErr || !client) throw new Error(cErr?.message || "CLIENT_NOT_FOUND");

  // 3) cria customer no Stripe
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: client.name ?? client.slug ?? `Client ${client.id}`,
    metadata: {
      wavie_client_id: client.id,
    },
  });

  // 4) persistir mapeamento (RLS: wavie_admin)
  const { error: insErr } = await supabase.from("stripe_customers").insert({
    client_id: client.id,
    stripe_customer_id: customer.id,
    stripe_mode: "test",
  } as any);

  if (insErr) throw new Error(insErr.message);

  // opcional: log em audit trail futuro (não obrigatório agora)
  void userId;

  return { stripe_customer_id: customer.id, reused: false };
}

