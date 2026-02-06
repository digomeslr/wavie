import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function assertCronAuth(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new Error("CRON_SECRET is not set");

  const provided =
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice("Bearer ".length)
      : null);

  if (!provided || provided !== expected) {
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    if (!assertCronAuth(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const limit = 10;

    const { data, error } = await supabase.rpc("dequeue_due_invoice_retries", {
      p_limit: limit,
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      worker: "invoice-retry",
      dequeued: (data ?? []).length,
      items: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        worker: "invoice-retry",
        error: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
