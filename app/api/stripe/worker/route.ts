// app/api/stripe/worker/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 🔐 Proteção simples: só quem tem a key interna pode chamar
function assertInternalAuth(req: Request) {
  const header = req.headers.get("x-internal-worker-key");
  const expected = process.env.INTERNAL_WORKER_KEY;

  if (!expected || header !== expected) {
    throw new Error("unauthorized");
  }
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
    // 1) garante que só chamada interna executa
    assertInternalAuth(req);

    const admin = getSupabaseAdmin();

    // 2) tenta pegar 1 evento da fila
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_next_stripe_event"
    );

    if (claimErr) {
      return NextResponse.json(
        { ok: false, error: claimErr.message },
        { status: 500 }
      );
    }

    // nada para processar
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ ok: true, processed: false });
    }

    const event = claimed[0];

    try {
      // ⚠️ F3.3: ainda NÃO processamos regra de negócio
      // apenas marcamos como processed para validar o fluxo

      const { error: doneErr } = await admin.rpc(
        "mark_stripe_event_processed",
        { p_id: event.id }
      );

      if (doneErr) {
        throw new Error(doneErr.message);
      }

      return NextResponse.json({
        ok: true,
        processed: true,
        stripe_event_id: event.stripe_event_id,
        event_type: event.event_type,
      });
    } catch (processErr: any) {
      // 3) se algo der errado, marca como failed
      await admin.rpc("mark_stripe_event_failed", {
        p_id: event.id,
        p_error: processErr?.message ?? "processing_error",
      });

      return NextResponse.json(
        { ok: false, error: processErr?.message ?? "processing_error" },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "unauthorized" },
      { status: 401 }
    );
  }
}
