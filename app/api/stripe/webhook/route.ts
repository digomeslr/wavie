// app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function getStripe() {
  const mode = (process.env.STRIPE_MODE ?? "test") as "test" | "live";

  const secretKey =
    mode === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

  if (!secretKey) throw new Error(`Stripe secret key missing for mode=${mode}`);

  // ⚠️ IMPORTANTE:
  // usamos a apiVersion exigida pela lib Stripe instalada no projeto
  return {
    stripe: new Stripe(secretKey, { apiVersion: "2026-01-28.clover" }),
    mode,
  };
}

function getWebhookSecret(mode: "test" | "live") {
  const whsec =
    mode === "live"
      ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
      : process.env.STRIPE_WEBHOOK_SECRET_TEST;

  if (!whsec) throw new Error(`Webhook signing secret missing for mode=${mode}`);
  return whsec;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is required");

  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const signature_present = !!sig;

  const request_id =
    req.headers.get("x-vercel-id") ??
    req.headers.get("x-request-id") ??
    null;

  const rawBody = await req.text();

  let event: Stripe.Event;
  let mode: "test" | "live";

  try {
    const { stripe, mode: m } = getStripe();
    mode = m;

    const whsec = getWebhookSecret(mode);
    if (!sig) throw new Error("Missing stripe-signature header");

    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    try {
      const admin = getSupabaseAdmin();
      await admin.from("stripe_webhook_events").insert({
        stripe_event_id: `invalid_${Date.now()}`,
        type: "signature_verification_failed",
        livemode: false,
        payload: { rawBody, error: err?.message ?? String(err) },
        status: "error",
        error_message: err?.message ?? String(err),
        signature_present,
        request_id,
      });
    } catch {}

    return new NextResponse(
      `Webhook Error: ${err?.message ?? "invalid signature"}`,
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // ✅ Audit trail (idempotente)
  const { error: upErr } = await admin
    .from("stripe_webhook_events")
    .upsert(
      {
        stripe_event_id: event.id,
        type: event.type,
        livemode: !!event.livemode,
        payload: { rawBody, event },
        status: "received",
        signature_present,
        request_id,
      },
      { onConflict: "stripe_event_id" }
    );

  if (upErr) {
    return new NextResponse(`DB Error: ${upErr.message}`, { status: 500 });
  }

  // ✅ F3.1 — enfileira para processamento futuro
  const { error: queueErr } = await admin
    .from("stripe_event_process_queue")
    .upsert(
      {
        stripe_event_id: event.id,
        livemode: !!event.livemode,
        event_type: event.type,
        status: "queued",
        attempts: 0,
      },
      { onConflict: "stripe_event_id" }
    );

  if (queueErr) {
    return new NextResponse(`Queue Error: ${queueErr.message}`, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
