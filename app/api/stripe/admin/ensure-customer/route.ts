// app/api/stripe/admin/ensure-customer/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function assertInternalAuth(req: Request) {
  const header = req.headers.get("x-internal-worker-key");
  const expected = process.env.INTERNAL_WORKER_KEY;
  if (!expected || header !== expected) throw new Error("unauthorized");
}

function getStripeMode() {
  const mode = (process.env.STRIPE_MODE ?? "test") as "test" | "live";
  return mode === "live" ? "live" : "test";
}

function getStripe() {
  const mode = getStripeMode();

  const secretKey =
    mode === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

  if (!secretKey) throw new Error(`Stripe secret key missing for mode=${mode}`);

  return {
    stripe: new Stripe(secretKey, { apiVersion: "2026-01-28.clover" }),
    mode,
  };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is required");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    assertInternalAuth(req);

    const body = await req.json().catch(() => ({}));
    const clientId = body?.client_id as string | undefined;
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "client_id is required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // 1) buscar client (nome/slug) para metadata
    const { data: clientRow, error: cErr } = await admin
      .from("clients")
      .select("id,name,slug,gateway_customer_id")
      .eq("id", clientId)
      .maybeSingle<{
        id: string;
        name: string | null;
        slug: string | null;
        gateway_customer_id: string | null;
      }>();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }
    if (!clientRow) {
      return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
    }

    // 2) DB-first: garante placeholder/valor existente
    const { data: gw, error: gwErr } = await admin.rpc(
      "get_or_create_gateway_customer_id",
      { p_client_id: clientId }
    );

    if (gwErr) {
      return NextResponse.json({ ok: false, error: gwErr.message }, { status: 500 });
    }

    // se já é cus_..., pronto
    if (typeof gw === "string" && gw.startsWith("cus_")) {
      return NextResponse.json({ ok: true, gateway_customer_id: gw, created: false });
    }

    // 3) criar no Stripe se ainda não existe
    const { stripe, mode } = getStripe();

    const customer = await stripe.customers.create({
      name: clientRow.name ?? clientRow.slug ?? `client:${clientRow.id}`,
      metadata: {
        wavie_client_id: clientRow.id,
        wavie_client_slug: clientRow.slug ?? "",
        env: mode,
      },
    });

    // 4) persistir no DB (idempotente: só troca se ainda NEEDS_CREATE)
    const { error: upErr } = await admin
      .from("clients")
      .update({ gateway_customer_id: customer.id })
      .eq("id", clientRow.id)
      .eq("gateway_customer_id", "NEEDS_CREATE");

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      gateway_customer_id: customer.id,
      created: true,
    });
  } catch (err: any) {
    const msg = err?.message ?? "unknown_error";
    const code = msg === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
